FROM node:14

# RUN apt update && apt install -y build-essential g++ tar gyp

WORKDIR /app
COPY package-lock.json /app/
COPY package.json /app/

RUN npm i github:barrysteyn/node-scrypt#fb60a8d3c158fe115a624b5ffa7480f3a24b03fb
RUN npm i
COPY . /app/

EXPOSE 3000

ENTRYPOINT ["node"]
