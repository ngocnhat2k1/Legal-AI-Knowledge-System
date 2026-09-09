# syntax=docker/dockerfile:1

# On-request legal ingest (Phase 7 layer 2). Python because the document parser needs
# pdfplumber — a Công báo signed PDF is the only clean source for a consolidated
# document, and pypdf inserts mid-word spaces ("n ăm"). Kept out of the API image,
# which is Node and has no business carrying a PDF stack.
FROM python:3.12-slim

WORKDIR /app
ENV PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir pdfplumber==0.11.8 "psycopg[binary]==3.2.*"

# g7.cdnchinhphu.vn — where Công báo serves the actual document files — presents ONLY its
# leaf certificate and omits the GlobalSign intermediate that signs it. Browsers, curl and
# Node paper over that by fetching the missing issuer themselves; Python's ssl does not,
# so every download failed with CERTIFICATE_VERIFY_FAILED.
#
# The fix installs that one publicly published intermediate, PINNED by SHA-256, rather
# than turning verification off. Fetching it at build time and checking the fingerprint
# means an attacker on the (plain-HTTP) CA endpoint cannot slip in a trust anchor, and a
# GlobalSign rotation breaks the BUILD loudly instead of the ingest silently.
ADD --checksum=sha256:b676ffa3179e8812093a1b5eafee876ae7a6aaf231078dad1bfb21cd2893764a \
    https://secure.globalsign.com/cacert/gsrsaovsslca2018.crt /tmp/gs-intermediate.crt
RUN openssl x509 -inform DER -in /tmp/gs-intermediate.crt \
      -out /usr/local/share/ca-certificates/globalsign-rsa-ov-ssl-2018.crt \
 && update-ca-certificates \
 && rm /tmp/gs-intermediate.crt

# The parser is shared with the hand-built corpus pipeline — ONE copy of the rules that
# took three rounds of failure to get right (see .agent/docs/legal-corpus-self-extension.md).
COPY research/legal-loader/parse_provisions.py research/legal-loader/build_chunks.py ./research/legal-loader/
COPY apps/ingest/ ./apps/ingest/

WORKDIR /app/apps/ingest
ENTRYPOINT ["python3", "ingest_document.py"]
