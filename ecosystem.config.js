module.exports = {
    apps: [
        {
            name: 'dental-crm-backend',
            script: 'dist/server.js',
            instances: 'max', // Use all available CPU cores
            exec_mode: 'cluster',
            watch: false, // Don't watch in production
            max_memory_restart: '1G',
            env: {
                NODE_ENV: 'production',
                PORT: 3000
            },
            env_development: {
                NODE_ENV: 'development',
                PORT: 3000,
                watch: true,
                watch_delay: 1000,
                ignore_watch: ['node_modules', 'logs']
            },
            env_staging: {
                NODE_ENV: 'staging',
                PORT: 3000
            },
            // Logging
            log_file: 'logs/combined.log',
            out_file: 'logs/out.log',
            error_file: 'logs/error.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

            // Auto restart on crash
            autorestart: true,
            max_restarts: 10,
            min_uptime: '10s',

            // Health monitoring
            health_check_grace_period: 3000,

            // Process behavior
            kill_timeout: 5000,
            listen_timeout: 3000,

            // Advanced features
            merge_logs: true,
            time: true
        }
    ]
};