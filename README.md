# Tanuki Legion

Legion is a lightweight agent that connects your devices to Tanuki Cloud, enabling remote development and automation capabilities.

## Installation

### Quick Install

```bash
curl -sL https://tanuki.sabw.ru/install-legion | LEGION_TOKEN=your_token_here bash
```

### Manual Installation

1. **Install dependencies:**

```bash
bun install
```

2. **Configure:**

Create `~/.tanuki/config.json`:

```json
{
  "token": "your_legion_token",
  "serverUrl": "wss://tanuki.sabw.ru"
}
```

Or set environment variables:

```bash
export LEGION_TOKEN=your_token_here
export TANUKI_SERVER_URL=wss://tanuki.sabw.ru
```

3. **Run:**

```bash
bun run dev
```

## Features

- 🔗 **Cloud Connection**: Seamlessly connect to Tanuki Cloud via WebSocket
- 🛡️ **Secure Authentication**: Token-based authentication for device access
- 🔄 **Auto-Reconnection**: Automatic reconnection on network interruptions
- 📊 **Device Management**: Manage multiple devices from Tanuki Cloud dashboard

## Configuration

Configuration is stored in `~/.tanuki/config.json`:

- `token`: Your Legion device token (required)
- `serverUrl`: Tanuki Cloud server URL (default: `wss://tanuki.sabw.ru`)

## Getting a Token

1. Log in to [Tanuki Cloud](https://tanuki.sabw.ru)
2. Go to Settings → Devices
3. Click "Connect New Device"
4. Copy the installation command or token

## Development

This project uses [Bun](https://bun.sh) as the JavaScript runtime.

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Type check
bun run typecheck

# Build
bun run build
```

## License

Proprietary - Tanuki Cloud
