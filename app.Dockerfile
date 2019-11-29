FROM node

WORKDIR /app

COPY package.json .
COPY package-lock.json .

RUN npm install

COPY lib lib
COPY local_modules local_modules
COPY public public
COPY routes routes
COPY tools tools
COPY views views
COPY *.js ./
COPY config.json config.json

ENTRYPOINT [ "node", "app.js" ]
