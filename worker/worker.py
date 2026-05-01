#!/usr/bin/env python3
"""
AI Task Platform - Python Worker Service
Processes tasks from Redis queue and updates MongoDB.
"""

import os
import json
import time
import signal
import logging
from datetime import datetime, timezone
from dotenv import load_dotenv

import redis
from pymongo import MongoClient
from bson import ObjectId

load_dotenv()

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("worker")


# ─── Configuration ─────────────────────────────────────────────────────────────
REDIS_HOST = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or None
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/ai-task-platform")
QUEUE_NAME = "bull:task-queue"
WORKER_ID = os.getenv("HOSTNAME", "worker-0")


# ─── Supported Operations ──────────────────────────────────────────────────────
def process_uppercase(text: str) -> str:
    return text.upper()

def process_lowercase(text: str) -> str:
    return text.lower()

def process_reverse(text: str) -> str:
    return text[::-1]

def process_word_count(text: str) -> str:
    words = text.split()
    unique = set(words)
    lines = text.count('\n') + 1 if text else 0
    return json.dumps({
        "total_words": len(words),
        "unique_words": len(unique),
        "characters": len(text),
        "characters_no_spaces": len(text.replace(" ", "")),
        "lines": lines,
        "sentences": text.count('.') + text.count('!') + text.count('?'),
    })

OPERATIONS = {
    "uppercase": process_uppercase,
    "lowercase": process_lowercase,
    "reverse": process_reverse,
    "word_count": process_word_count,
}


# ─── Database Helpers ───────────────────────────────────────────────────────────
def update_task_status(collection, task_id: str, status: str, **kwargs):
    update = {
        "$set": {
            "status": status,
            **kwargs
        },
        "$push": {
            "logs": {
                "timestamp": datetime.now(timezone.utc),
                "level": "error" if status == "failed" else "info",
                "message": kwargs.get("errorMessage", f"Task status updated to {status} by {WORKER_ID}")
            }
        }
    }
    collection.update_one({"_id": ObjectId(task_id)}, update)


def add_log(collection, task_id: str, message: str, level: str = "info"):
    collection.update_one(
        {"_id": ObjectId(task_id)},
        {
            "$push": {
                "logs": {
                    "timestamp": datetime.now(timezone.utc),
                    "level": level,
                    "message": message
                }
            }
        }
    )


# ─── Job Processor ─────────────────────────────────────────────────────────────
def process_job(collection, job_data: dict):
    task_id = job_data.get("taskId")
    operation = job_data.get("operation")
    input_text = job_data.get("inputText", "")

    logger.info(f"Processing task {task_id} | op={operation} | worker={WORKER_ID}")

    try:
        # Mark as running
        update_task_status(collection, task_id, "running",
                           startedAt=datetime.now(timezone.utc))
        add_log(collection, task_id, f"Worker {WORKER_ID} picked up task")
        add_log(collection, task_id, f"Executing operation: {operation}")

        # Validate operation
        if operation not in OPERATIONS:
            raise ValueError(f"Unknown operation: {operation}")

        # Simulate processing time for realism
        time.sleep(0.5)

        # Execute operation
        result = OPERATIONS[operation](input_text)

        # Mark as success
        update_task_status(collection, task_id, "success",
                           result=result,
                           completedAt=datetime.now(timezone.utc))
        add_log(collection, task_id, "Task completed successfully ✓")

        logger.info(f"Task {task_id} completed successfully")

    except Exception as e:
        logger.error(f"Task {task_id} failed: {str(e)}")
        update_task_status(collection, task_id, "failed",
                           errorMessage=str(e),
                           completedAt=datetime.now(timezone.utc))
        add_log(collection, task_id, f"Task failed: {str(e)}", level="error")


# ─── Bull Queue Consumer ────────────────────────────────────────────────────────
def get_next_job(r: redis.Redis) -> dict | None:
    """
    Bull (Node.js) stores jobs in Redis using specific keys.
    We use BLPOP on the wait list to get the next job ID.
    """
    try:
        # Bull v4 queue key format
        result = r.blpop(f"bull:task-queue:wait", timeout=5)
        if not result:
            return None

        _, job_id_bytes = result
        job_id = job_id_bytes.decode("utf-8")

        # Get job data
        job_key = f"bull:task-queue:{job_id}"
        job_raw = r.hget(job_key, "data")
        if not job_raw:
            return None

        job_data = json.loads(job_raw)

        # Move to active
        r.lrem(f"bull:task-queue:wait", 1, job_id)
        r.lpush(f"bull:task-queue:active", job_id)

        return {"id": job_id, "data": job_data}

    except Exception as e:
        logger.warning(f"Error fetching job: {e}")
        return None


def complete_job(r: redis.Redis, job_id: str, success: bool):
    """Move job from active to completed/failed in Bull."""
    try:
        r.lrem(f"bull:task-queue:active", 1, job_id)
        target = "completed" if success else "failed"
        r.lpush(f"bull:task-queue:{target}", job_id)
    except Exception as e:
        logger.warning(f"Error completing job {job_id}: {e}")


# ─── Main Worker Loop ──────────────────────────────────────────────────────────
class Worker:
    def __init__(self):
        self.running = True
        self.redis_client = None
        self.mongo_client = None
        self.collection = None

        signal.signal(signal.SIGTERM, self._handle_shutdown)
        signal.signal(signal.SIGINT, self._handle_shutdown)

    def _handle_shutdown(self, signum, frame):
        logger.info(f"Worker {WORKER_ID} shutting down gracefully...")
        self.running = False

    def connect(self):
        retry_count = 0
        max_retries = 10

        while retry_count < max_retries:
            try:
                logger.info(f"Connecting to Redis at {REDIS_HOST}:{REDIS_PORT}...")
                self.redis_client = redis.Redis(
                    host=REDIS_HOST,
                    port=REDIS_PORT,
                    password=REDIS_PASSWORD,
                    decode_responses=False,
                    socket_keepalive=True,
                    health_check_interval=30
                )
                self.redis_client.ping()
                logger.info("Redis connected ✓")

                logger.info(f"Connecting to MongoDB...")
                self.mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
                db = self.mongo_client.get_database()
                self.collection = db["tasks"]
                self.mongo_client.admin.command("ping")
                logger.info("MongoDB connected ✓")

                return True

            except Exception as e:
                retry_count += 1
                wait = min(2 ** retry_count, 30)
                logger.error(f"Connection failed (attempt {retry_count}/{max_retries}): {e}")
                if retry_count < max_retries:
                    logger.info(f"Retrying in {wait}s...")
                    time.sleep(wait)

        logger.critical("Failed to connect after maximum retries. Exiting.")
        return False

    def run(self):
        if not self.connect():
            exit(1)

        logger.info(f"Worker {WORKER_ID} started. Listening for jobs...")

        while self.running:
            try:
                job = get_next_job(self.redis_client)

                if job:
                    job_id = job["id"]
                    job_data = job["data"]
                    success = False

                    try:
                        process_job(self.collection, job_data)
                        success = True
                    except Exception as e:
                        logger.error(f"Unexpected error processing job {job_id}: {e}")
                    finally:
                        complete_job(self.redis_client, job_id, success)
                else:
                    # No job available (timeout), continue polling
                    pass

            except redis.exceptions.ConnectionError as e:
                logger.error(f"Redis connection lost: {e}. Reconnecting...")
                time.sleep(5)
                self.connect()

            except Exception as e:
                logger.error(f"Worker loop error: {e}")
                time.sleep(1)

        logger.info("Worker stopped.")
        if self.mongo_client:
            self.mongo_client.close()


if __name__ == "__main__":
    worker = Worker()
    worker.run()
