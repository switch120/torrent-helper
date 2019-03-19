# Torrent Helper - Docker OpenVPN + Tunnel + Transmission + Firebase

### Purpose
To run a Docker container inside a local NAS, with the ability to connect to a remote Firebase database and queue up Torrents remotely - or add them by hand with the Transmission web interface while the container is running locally.

### What it does
This project is a simple shell for a Docker container that runs OpenVPN and Transmission for securely torrenting files. The original Docker image used can be found [here](https://hub.docker.com/r/haugene/transmission-openvpn/)

Once started, the docker container will automatically connect to the configured VPN and load up Transmission server.

### How to use it

* Step 1 - edit `.env` and supply required credentials
* Step 2 (optional) - spin up the Vagrant VM for encapsulation with `vagrant up`, then ssh in with `vagrant ssh`
* Step 3 - cd to `/var/www` and run `docker-compose up -d`
* Step 4 - Run `npm run start` to start up the application, `ctrl+c` to stop

> NOTE: To restart the Docker container, use command `docker-compose down` or it will just shut down when the VM is turned off.

Once the application bootstraps, it will check Firebase for any newly added Torrents to download, and if it finds any it will queue them up in Transmission. (Sister UI project to come)

> Note: You can also start the application w/ command line arguments to start downloading a Magnet URI right away. Use syntax: `npm start magnetUri /download/folder`

### Torrent Cleanup
While running, this app will query Transmission torrents and immediately remove any torrents that have completed and begun seeding.

### Accessing Transmission WebUI
Once the Docker container is running, you should be able to access the Transmission web interface by visiting `http://localhost:9091/web` where you either use localhost, or the ip address of the VM that's bundled with this repo (see `vagrantfile`).

### Developer Notes
You can also run `npm run start:watch` to use nodemon and restart the app when changes are detected.