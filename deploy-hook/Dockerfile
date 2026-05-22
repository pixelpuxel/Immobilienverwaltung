FROM python:3.12-alpine

RUN apk add --no-cache docker-cli docker-cli-compose

WORKDIR /hook
COPY server.py /hook/server.py

ENV DEPLOY_HOST=0.0.0.0
ENV DEPLOY_PORT=8099
ENV DEPLOY_WORKDIR=/workspace
ENV DEPLOY_COMMAND="docker compose -p immobilienverwaltung up -d --build app"

EXPOSE 8099

CMD ["python", "/hook/server.py"]
