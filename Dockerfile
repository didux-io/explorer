FROM node:latest

WORKDIR /app
COPY package-lock.json /app/
COPY package.json /app/

RUN npm i
COPY . /app/

EXPOSE 3000

ENTRYPOINT ["node"]
