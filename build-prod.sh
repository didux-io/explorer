#!/bin/bash

$(aws ecr get-login --no-include-email --region eu-west-1)

docker build --no-cache -t smilo/explorer:mainnet .
docker tag smilo/explorer:mainnet 462619610638.dkr.ecr.eu-west-1.amazonaws.com/smilo/explorer:mainnet
docker push 462619610638.dkr.ecr.eu-west-1.amazonaws.com/smilo/explorer:mainnet
