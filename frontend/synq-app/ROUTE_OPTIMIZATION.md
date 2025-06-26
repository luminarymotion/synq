# Route Optimization Configuration

## MapQuest API Key Setup

To enable proper road-following routes (instead of straight lines), you need to configure a MapQuest API key.

### Steps:

1. **Get a free MapQuest API key:**
   - Visit: https://developer.mapquest.com/
   - Sign up for a free account
   - Create a new application
   - Copy your API key

2. **Configure the API key:**
   - Create a `.env` file in the `frontend/synq-app/` directory
   - Add the following line:
   ```
   VITE_MAPQUEST_API_KEY=your_actual_api_key_here
   ```

3. **Restart the development server:**
   ```bash
   npm start
   ```

### What this enables:

- **Road-following routes** instead of straight lines
- **Real traffic data** for route optimization
- **Accurate distance and time estimates**
- **Professional route visualization**

### Fallback behavior:

If no API key is configured, the app will:
1. Try to use OpenStreetMap routing (free)
2. Fall back to enhanced straight lines with intermediate points
3. Still provide functional route visualization

### API Usage:

The MapQuest API is used for:
- Route calculation between waypoints
- Traffic-aware routing
- Distance and duration estimates
- Road-following path generation

Free tier includes 15,000 requests per month, which is sufficient for development and small-scale usage. 