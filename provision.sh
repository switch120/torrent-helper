#!/usr/bin/env bash

# GPG key for docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -

# Add docker to apt-get
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable"

sudo apt-get update

# Install utilities and Mongo
sudo apt-get install -y build-essential unzip git

# Set Timezone if needed
sudo timedatectl set-timezone America/New_York

# Install node 8
curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
sudo apt-get install -y nodejs

# Python package manager so we can install latest aws-cli
sudo apt-get install -y python-pip

# Upgrade Pip
sudo pip install --upgrade pip

# Install AWS CLI
sudo pip install awscli

# Install Docker
sudo apt-get install -y docker-ce

# Setup docker-compose
sudo curl -L "https://github.com/docker/compose/releases/download/1.22.0/docker-compose-$(uname -s)-$(uname -m)"  -o /usr/local/bin/docker-compose 

# Set execute permissions for docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# setup permissions for vagrant to access docker (runs on tcp owned by root)
sudo groupadd docker
sudo gpasswd -a vagrant docker

# Fix npm permissions issues (un-privileged provisioner)
sudo npm i -g npm

cd /var/www
npm install

sudo chown -R $USER:$(id -gn $USER) /home/vagrant/.config

# Copy environment files from example if it doesn't already exist
cp -n .env.example .env