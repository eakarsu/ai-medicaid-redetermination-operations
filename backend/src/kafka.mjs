// kafka.mjs — Real Kafka producer (kafkajs) for the transactional outbox.
// When KAFKA_BROKERS is set (docker-compose provides a KRaft broker), drained outbox
// events are produced to a real topic. Without it, the dispatcher still drains locally,
// so local development and tests never require a broker.

import { Kafka } from 'kafkajs';

const TOPIC = process.env.KAFKA_TOPIC || 'renewalcare.events';
let producer = null;
let connected = false;

export function kafkaConfigured() {
  return Boolean(process.env.KAFKA_BROKERS);
}

export async function kafkaConnect() {
  if (!kafkaConfigured() || connected) return connected;
  try {
    const kafka = new Kafka({ clientId: 'renewalcare-medicaid', brokers: process.env.KAFKA_BROKERS.split(',').map(broker => broker.trim()) });
    producer = kafka.producer();
    await producer.connect();
    connected = true;
    console.log(`Kafka producer connected (${process.env.KAFKA_BROKERS}, topic ${TOPIC})`);
  } catch (error) {
    console.error(`Kafka connection failed: ${error.message}`);
    connected = false;
  }
  return connected;
}

export async function publishToKafka(event) {
  if (!connected || !producer) return false;
  try {
    await producer.send({
      topic: TOPIC,
      messages: [{
        key: `${event.aggregate_type}:${event.aggregate_id}`,
        value: JSON.stringify({
          eventId: event.id,
          type: event.event_type,
          aggregateType: event.aggregate_type,
          aggregateId: event.aggregate_id,
          payload: event.payload,
          createdAt: event.created_at,
        }),
      }],
    });
    return true;
  } catch (error) {
    console.error(`Kafka produce failed for event ${event.id}: ${error.message}`);
    return false;
  }
}

export async function kafkaDisconnect() {
  if (producer && connected) { try { await producer.disconnect(); } catch {} }
  connected = false;
}

export function kafkaStatus() {
  return { configured: kafkaConfigured(), connected, topic: TOPIC, clientId: 'renewalcare-medicaid', guarantee: 'at-least-once via transactional outbox' };
}
