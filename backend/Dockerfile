FROM python:3.10-slim

WORKDIR /app

# Install system dependencies: ffmpeg for audio processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip install --no-cache-dir --upgrade pip

COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the code
COPY . .

# Explicitly use the python module version of gunicorn to avoid PATH issues
# Increase timeout to 10 minutes (600s) for long-running transcription/analysis
CMD ["python3", "-m", "gunicorn", "--bind", "0.0.0.0:5000", "--timeout", "600", "--workers", "2", "app:app"]