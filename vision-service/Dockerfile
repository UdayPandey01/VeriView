FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_DEFAULT_TIMEOUT=120 \
    PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK=True

WORKDIR /app

RUN sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update -o Acquire::ForceIPv4=true -o Acquire::Retries=3 && \
    apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN sh -c 'for i in 1 2 3; do \
    python -m pip install --no-cache-dir --retries 20 --timeout 120 -r requirements.txt && exit 0; \
    python -m pip install --no-cache-dir --retries 20 --timeout 120 -i https://pypi.tuna.tsinghua.edu.cn/simple --trusted-host pypi.tuna.tsinghua.edu.cn -r requirements.txt && exit 0; \
    python -m pip install --no-cache-dir --retries 20 --timeout 120 -i https://mirrors.aliyun.com/pypi/simple --trusted-host mirrors.aliyun.com -r requirements.txt && exit 0; \
    echo "pip install failed (attempt $i/3 across all mirrors), retrying..."; \
    sleep $((i * 10)); \
done; exit 1'

RUN python - <<'PY'
import sys

try:
    from paddleocr import PaddleOCR
    try:
        PaddleOCR(use_angle_cls=True, lang='en', use_onnx=True)
    except Exception as e:
        print(f"PaddleOCR ONNX warmup fallback: {e}", file=sys.stderr)
        PaddleOCR(use_angle_cls=True, lang='en')
except Exception as e:
    print(f"PaddleOCR warmup skipped: {e}", file=sys.stderr)
PY

COPY . .

RUN useradd -m -u 1000 veriview
USER veriview

EXPOSE 5000
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "5000"]

