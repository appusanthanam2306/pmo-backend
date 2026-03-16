# PMO Tracking Node.js Server

A simple Node.js server built with Express.js, featuring a sample GET API endpoint.

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm

### Installation

1. Clone or navigate to the project directory.
2. Run `npm install` to install dependencies.

### Running the Server

- To start the server: `npm start`
- For development with auto-restart: `npm run dev`

The server will run on `http://localhost:3000` by default.

## API Endpoints

### GET /api/sample

Returns a sample JSON response with a message, timestamp, and status.

**Example Request:**

```
GET http://localhost:3000/api/sample
```

**Example Response:**

```json
{
  "message": "Hello from PMO Tracking API!",
  "timestamp": "2023-10-01T12:00:00.000Z",
  "status": "success"
}
```

### GET /

Returns a welcome message.

## Project Structure

- `server.js` - Main server file
- `package.json` - Project configuration and dependencies

## Technologies Used

- Node.js
- Express.js
# pmo-project-nodejs
