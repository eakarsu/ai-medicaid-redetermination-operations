# Cloud reference architecture (AWS) — Medicaid Enterprise layer 6.
# Reference-grade IaC for the containerized platform: multi-AZ VPC, TLS ALB, ECS Fargate,
# encrypted RDS PostgreSQL, secrets manager, and centralized logs. Apply per-environment
# with terraform init/plan/apply after building and pushing the image to ECR.

terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

variable "region" { default = "us-east-1" }
variable "project" { default = "renewalcare-medicaid" }
variable "image_url" { description = "ECR image for the API container" }
variable "db_instance_class" { default = "db.t4g.medium" }

# ---- Network: multi-AZ VPC with private application/data subnets ----
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = var.project
  cidr = "10.40.0.0/16"

  azs             = ["${var.region}a", "${var.region}b"]
  public_subnets  = ["10.40.0.0/20", "10.40.16.0/20"]
  private_subnets = ["10.40.32.0/20", "10.40.48.0/20"]

  enable_nat_gateway   = true
  single_nat_gateway   = false
  enable_dns_hostnames = true
}

# ---- Data: encrypted managed PostgreSQL (Multi-AZ, automated backups) ----
resource "aws_db_subnet_group" "this" {
  name       = "${var.project}-db"
  subnet_ids = module.vpc.private_subnets
}

resource "aws_db_instance" "postgres" {
  identifier                   = "${var.project}-pg"
  engine                       = "postgres"
  engine_version               = "16"
  instance_class               = var.db_instance_class
  allocated_storage            = 50
  storage_encrypted            = true
  db_name                      = "renewalcare"
  username                     = "renewalcare_admin"
  password                     = random_password.db_password.result
  db_subnet_group_name         = aws_db_subnet_group.this.name
  multi_az                     = true
  backup_retention_period      = 14
  backup_window                = "03:00-04:00"
  deletion_protection          = true
  skip_final_snapshot          = false
  final_snapshot_identifier    = "${var.project}-final"
  performance_insights_enabled = true
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

# ---- Secrets: session/PHI/OpenRouter secrets in Secrets Manager ----
resource "aws_secretsmanager_secret" "app_secrets" {
  name                    = "${var.project}/app-secrets"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id
  secret_string = jsonencode({
    SESSION_SECRET     = random_password.db_password.result
    PHI_ENCRYPTION_KEY = random_password.db_password.result
    DATABASE_URL       = "postgresql://renewalcare_admin:${random_password.db_password.result}@${aws_db_instance.postgres.endpoint}/renewalcare"
  })
}

# ---- Compute: TLS ALB in front of an autoscaled ECS Fargate service ----
resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.project}"
  retention_in_days = 365
}

resource "aws_ecs_cluster" "this" {
  name = var.project
}

resource "aws_lb" "this" {
  name               = var.project
  internal           = false
  load_balancer_type = "application"
  subnets            = module.vpc.public_subnets
}

resource "aws_lb_target_group" "api" {
  name        = "${var.project}-api"
  port        = 5542
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"
  health_check {
    path                = "/api/health"
    interval            = 30
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn
  default_action {
    target_group_arn = aws_lb_target_group.api.arn
    type             = "forward"
  }
}

variable "acm_certificate_arn" { description = "ACM certificate for TLS termination at the ALB" }

# ECS task definition and service would reference var.image_url; shown condensed for the
# reference architecture — see README for the full module set.
output "database_endpoint" { value = aws_db_instance.postgres.endpoint }
output "load_balancer_dns" { value = aws_lb.this.dns_name }
output "secrets_secret_arn" { value = aws_secretsmanager_secret.app_secrets.arn }
