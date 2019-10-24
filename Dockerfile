FROM node:8

#RUN apt update && apt install -y build-essential g++ tar gyp

WORKDIR /app
COPY package-lock.json /app/
COPY package.json /app/

RUN npm i
COPY . /app/

EXPOSE 3000

ENTRYPOINT ["node"]