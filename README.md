<p align="center">
  <img src="assets/logo/myrient_temp_logo.png" alt="Minerva Search logo" width="200"
  style = "border-radius: 30%;"/>
</p>

<h1 align="center">Minerva Search</h1>

<p align="center">
  <strong>Remember the game? We'll handle the rest</strong>
</p>

<p align="center">
  <a href="#about">About</a> •
  <a href="#features">Features</a> •
  <a href="#prerequisites">Prerequisites</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#license">License</a>
</p>

<p align="center">
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/github/languages/top/Myrient-Search/Myrient-Search?logo=typescript&logoColor=white&style=for-the-badge" alt="Language">
  </a>
  <a href="https://github.com/Myrient-Search/Myrient-Search/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/Myrient-Search/Myrient-Search?style=for-the-badge" alt="License">
  </a>
</p>

## About

**Minerva Search** is a self-hosted game search engine that allows you to search for games across the Myrient Erista database.

This is a full rewrite of the original Minerva Search project, with better UI and performance.

## Features

- Search across the millions of ROMS available on Myrient within milliseconds
- Download any file directly and in full speed, no annoying captchas, waiting times, or ads
- Game details, screenshots, and more by IGDB
- AI-powered game recommendations and chat
- Web Emulation support for most systems (coming soon)

## Prerequisites

To use Minerva Search, you'll need:
- A Twitch Application (https://dev.twitch.tv/console) to get a Client ID and Client Secret (optional)
- An OpenAI-compatible API key (We recommend using Google Gemini) (optional)

For deployment:
*   **Docker & Docker Compose** (Recommended)
*   OR **Node.js 24+**

## Installation

### Using Docker (Recommended)

1.  Clone the repository:
    ```bash
    git clone https://github.com/Myrient-Search/Myrient-Search.git
    cd Myrient-Search
    ```
2.  Run the application:
    ```bash
    docker-compose up -d
    ```
3.  Open your browser and navigate to `http://localhost`.

### Native Node.js Installation

1.  Clone the repository and enter the directory:
    ```bash
    git clone https://github.com/Myrient-Search/Myrient-Search.git
    cd Myrient-Search
    ```
2.  Install dependencies:
    ```bash
    cd frontend/
    npm install
    cd ../backend/
    npm install
    ```
3.  Run the server:
    ```bash
    cd frontend/
    npm run dev
    ```
    ```bash
    cd backend/
    npm run dev
    ```
4.  Open your browser and navigate to `http://localhost:5173`.

## Usage

You'll need to configure the environment variables in the `.env` file. The application will fail to start if you don't configure them.

If you set an `ADMIN_KEY` in the `.env` file, you can access the admin panel at `/admin`. Make sure to set a strong password for the admin panel.

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPLv3)**. This means that you are free to use, modify and distribute the software, so as long as you release the source code of your fork to all users, even when interacting with it over a network.

See the [LICENSE](LICENSE) file for details.

## Disclaimer

Minerva Search has no affiliation or endorsement from Myrient, IGDB, or any other entity. The developers cannot be held responsible for any misuse of this software. This software does not host any ROMs, games, or any copyrighted content. It is purely a tool for searching and downloading ROMs from remote servers.
