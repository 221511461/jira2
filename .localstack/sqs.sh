#!/usr/bin/env bash

# Development queues
awslocal sqs create-queue --queue-name backfill
awslocal sqs create-queue --queue-name push
awslocal sqs create-queue --queue-name discovery
awslocal sqs create-queue --queue-name deployment
awslocal sqs create-queue --queue-name branch

# Test queues
awslocal sqs create-queue --queue-name test-sqs-client
awslocal sqs create-queue --queue-name test-backfill
awslocal sqs create-queue --queue-name test-push
awslocal sqs create-queue --queue-name test-discovery
awslocal sqs create-queue --queue-name test-deployment
awslocal sqs create-queue --queue-name test-branch

