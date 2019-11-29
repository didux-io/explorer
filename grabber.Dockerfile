FROM node

WORKDIR /app

COPY package.json package.json
COPY package-lock.json package-lock.json

RUN npm install
RUN npm install forever -g

COPY tools tools
COPY lib lib
COPY *.js ./
COPY config.json config.json

ENTRYPOINT [ "forever", "./tools/grabber.js" ]
