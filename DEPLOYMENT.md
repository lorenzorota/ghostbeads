# Deployment

GhostBeads is a static Progressive Web App (PWA). The contents of the `site/` directory can be hosted on any static web server with HTTPS support.

## GitHub Actions

An optional GitHub Actions workflow (`.github/workflows/deploy.yml`) supports automatic deployment via SSH and `rsync`.

Deployment is disabled by default, allowing forks to configure their own hosting environments.

### Configuration

Create a GitHub environment named `production` and configure the following:

**Repository variables**

| Variable | Description |
|---|---|
| `DEPLOY_ENABLED` | Set to `true` to enable deployment |
| `DEPLOY_PORT` | SSH port (optional, defaults to `22`) |

**Environment secrets**

| Secret | Description |
|---|---|
| `DEPLOY_TARGET` | Destination in `user@host:/absolute/path/` format |
| `DEPLOY_SSH_KEY` | Private SSH key for deployment |
| `DEPLOY_KNOWN_HOSTS` | Verified SSH host key entry |

The destination directory must exist and be writable by the deployment user.

### Deployment behavior

When enabled, the workflow deploys changes pushed to `main` or can be triggered manually from GitHub Actions.

- Uploads the contents of `site/` using SSH and `rsync`.
- Does not delete existing files on the destination.
- Does not build the application or generate audio assets.
- Requires no server-specific configuration in the repository.

### Audio assets

Generated voice recordings are managed separately and are not included in the repository. To enable voice exercises and complete offline functionality, place the required audio assets in the appropriate `audio/` directory on the hosting server.

## Manual deployment

Alternatively, upload the contents of `site/` directly to your preferred static hosting provider.