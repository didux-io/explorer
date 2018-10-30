FROM node

WORKDIR /app

COPY package.json package.json
COPY package-lock.json package-lock.json

RUN npm install

COPY tools tools
COPY lib lib
COPY *.js ./
COPY config.json config.json

ENTRYPOINT [ "node", "./tools/grabber.js" ]
