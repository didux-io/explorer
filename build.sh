#!/bin/bash

$(aws ecr get-login --no-include-email --region eu-west-1)

docker build --no-cache -t smilo/explorer:grabber -f grabber.Dockerfile .
docker tag smilo/explorer:grabber 462619610638.dkr.ecr.eu-west-1.amazonaws.com/smilo/explorer:grabber
docker push 462619610638.dkr.ecr.eu-west-1.amazonaws.com/smilo/explorer:grabber

docker build --no-cache -t smilo/explorer:app -f app.Dockerfile .
docker tag smilo/explorer:app 462619610638.dkr.ecr.eu-west-1.amazonaws.com/smilo/explorer:app
docker push 462619610638.dkr.ecr.eu-west-1.amazonaws.com/smilo/explorer:app