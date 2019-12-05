#!/bin/bash

$(aws ecr get-login --no-include-email --region eu-central-1)

docker build --no-cache -t didux/explorer:test .
docker tag didux/explorer:test 462619610638.dkr.ecr.eu-central-1.amazonaws.com/didux/explorer:test
docker push 462619610638.dkr.ecr.eu-central-1.amazonaws.com/didux/explorer:test
