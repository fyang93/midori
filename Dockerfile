FROM node:lts AS build-stage

WORKDIR /app
COPY . .
RUN npm install \
    && npm run build-prod

FROM python:3.9-slim AS run-stage

WORKDIR /app
COPY --from=build-stage /app/docs ./docs

COPY requirements.txt ./
COPY app.py ./

RUN pip install -r requirements.txt

ENV FLASK_APP=app.py
ENV FLASK_RUN_HOST=0.0.0.0

CMD ["flask", "run"]