FROM python:3.11-slim
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python - <<'PY'
from paddleocr import PaddleOCR

try:
	PaddleOCR(use_angle_cls=True, lang='en', use_onnx=True)
except Exception:
	PaddleOCR(use_angle_cls=True, lang='en')
PY
COPY . .
RUN useradd -m -u 1000 veriview
USER veriview
EXPOSE 5000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "5000"]

