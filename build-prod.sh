#!/bin/bash

$(aws ecr get-login --no-include-email --region eu-central-1)

docker build --no-cache -t didux/explorer:prod .
docker tag didux/explorer:prod 462619610638.dkr.ecr.eu-central-1.amazonaws.com/didux/explorer:prod
docker push 462619610638.dkr.ecr.eu-central-1.amazonaws.com/didux/explorer:prod
