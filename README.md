# Torrent Helper - Docker OpenVPN + Tunnel + Transmission + Firebase

### Purpose
To run a Docker container set inside a local NAS, with the ability to connect to a remote Firebase database and queue up Torrents remotely - or add them by hand with the Transmission web interface while the container is running locally. For increased security, the OpenVPN container will disconnect Transmission if the tunnel fails, and a second container runs the included helper app, written in TypeScript, to watch both the Firebase database and clean up Torrents as they finish from Transmission.

### What it does
This project is a simple shell for a Docker container that runs OpenVPN and Transmission for securely torrenting files. The original Docker image used can be found [here](https://hub.docker.com/r/haugene/transmission-openvpn/)

Once started, the docker container will automatically connect to the configured VPN and load up Transmission server, as well as spin up a secondary container to run the included helper script.

### Getting Started
* Create a Firebase project and locate access credentials to put into the `.env` file.
* [Read the OpenVPN Docker Container Documentation](https://hub.docker.com/r/haugene/transmission-openvpn/) for setting up your VPN if it's not the default Private Internet Access (PIA)
* Modify the `SOURCE_VOLUME` value in `.env` to reflect the location you want Torrents to be saved. Default is the `./data` folder located within the Repository. Ex: Synology NAS - `/volume1/video`

### How to use it

* Step 1 - edit `.env` and supply required credentials/setup
* Step 2 (optional, recommended) - spin up the Vagrant VM for encapsulation with `vagrant up`, then ssh in with `vagrant ssh`
* Step 3 - cd to `/var/www` and run:
    * `npm install` (only if you are not using the Vagrant VM, which will have already provisioned this on boot)
    * `docker-compose up` (optionally add the `-d` parameter to run the containers in the background)

> NOTE: To restart the Docker container, use command `docker-compose down` or it will just shut down when the VM is turned off.

Once the application bootstraps, it will check Firebase for any newly added Torrents to download, and if it finds any it will queue them up in Transmission. (Sister UI project to come)

> Note: You can also start the application w/ command line arguments to start downloading a Magnet URI right away. Use syntax: `npm start magnetUri /download/folder`

### Torrent Cleanup
While running, this app will query Transmission torrents and immediately remove any torrents that have completed and begun seeding.

### Accessing Transmission WebUI
Once the Docker container is running, you should be able to access the Transmission web interface by visiting `http://localhost:9091/web` where you either use `localhost`, or the ip address of the VM that's bundled with this repo (see `vagrantfile`).

### Developer Notes
You can also run `npm run start:watch` to use nodemon and restart the app when changes are detected without running the docker containers.