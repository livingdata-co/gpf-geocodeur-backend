#!/bin/sh

# Start server process
node server.js &

# Start worker process
node worker.js
