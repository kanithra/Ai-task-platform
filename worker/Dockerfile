# Stage 1: Builder
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# Stage 2: Production
FROM python:3.12-slim AS runner
WORKDIR /app
RUN groupadd -r worker && useradd -r -g worker worker
COPY --from=builder /root/.local /home/worker/.local
COPY worker.py .
RUN chown -R worker:worker /app /home/worker/.local
USER worker
ENV PATH=/home/worker/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1
CMD ["python", "-u", "worker.py"]
