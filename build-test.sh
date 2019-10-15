#!/bin/bash

$(aws ecr get-login --no-include-email --region eu-west-1)

docker build --no-cache -t smilo/explorer:testnet .
docker tag smilo/explorer:testnet 462619610638.dkr.ecr.eu-west-1.amazonaws.com/smilo/explorer:testnet
docker push 462619610638.dkr.ecr.eu-west-1.amazonaws.com/smilo/explorer:testnet
