// setup.js - Project setup script
const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up Empower Nyamagabe project...\n');

// Create necessary directories
const directories = [
    'public',
    'logs',
    'uploads'
];

directories.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✅ Created directory: ${dir}`);
    } else {
        console.log(`📁 Directory already exists: ${dir}`);
    }
});

// Create .env file if it doesn't exist
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
    const envContent = `# Empower Nyamagabe Environment Variables
NODE_ENV=development
PORT=3000
DB_PATH=./empower_nyamagabe.db

# Admin Configuration
ADMIN_EMAIL=admin@empowernyamagabe.org
ADMIN_PASSWORD=admin123

# Security Settings
JWT_SECRET=secret-jwt-key
BCRYPT_ROUNDS=10

# Email Configuration (Optional - for notifications)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

# Payment Gateway Configuration (Flutterwave - recommended for Rwanda MoMo + Cards)
APP_BASE_URL=http://localhost:3000
FLW_SECRET_KEY=
FLW_WEBHOOK_SECRET_HASH=

# Application Settings
MAX_UPLOAD_SIZE=5MB
DONATION_MIN_AMOUNT=1000
DONATION_MAX_AMOUNT=10000000

# Database Configuration
DB_BACKUP_INTERVAL=24h
DB_MAX_CONNECTIONS=10
`;

    fs.writeFileSync(envPath, envContent);
    console.log('✅ Created .env file with default configuration');
} else {
    console.log('📄 .env file already exists');
}

// Create public directory and move HTML file there
const htmlSource = path.join(__dirname, 'index.html');
const htmlDest = path.join(__dirname, 'public', 'index.html');

// If HTML file exists in root, move it to public
if (fs.existsSync(htmlSource) && !fs.existsSync(htmlDest)) {
    fs.copyFileSync(htmlSource, htmlDest);
    fs.unlinkSync(htmlSource);
    console.log('✅ Moved HTML file to public directory');
}

// Create README.md file
const readmePath = path.join(__dirname, 'README.md');
if (!fs.existsSync(readmePath)) {
    const readmeContent = `# Empower Nyamagabe\n\nA transparent donation platform for community-verified vulnerable families in Nyamagabe District, Rwanda. See the project README for setup and usage.\n`;

    fs.writeFileSync(readmePath, readmeContent);
    console.log('✅ Created comprehensive README.md file');
} else {
    console.log('📄 README.md file already exists');
}

// Create .gitignore file
const gitignorePath = path.join(__dirname, '.gitignore');
if (!fs.existsSync(gitignorePath)) {
    const gitignoreContent = `# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Database
*.db-journal
*.db-wal
*.db-shm

# Logs
logs/
*.log

# Runtime data
pids/
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/

# IDE files
.vscode/
.idea/
*.swp
*.swo

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Uploads
uploads/*
!uploads/.gitkeep

# Backup files
*.backup
*.bak

# Temporary files
tmp/
temp/
`;

    fs.writeFileSync(gitignorePath, gitignoreContent);
    console.log('✅ Created .gitignore file');
} else {
    console.log('📄 .gitignore file already exists');
}

// Create uploads directory with .gitkeep
const uploadsDir = path.join(__dirname, 'uploads');
const gitkeepPath = path.join(uploadsDir, '.gitkeep');
if (!fs.existsSync(gitkeepPath)) {
    fs.writeFileSync(gitkeepPath, '# Keep this directory');
    console.log('✅ Created uploads/.gitkeep');
}

// Create logs directory with .gitkeep
const logsDir = path.join(__dirname, 'logs');
const logsGitkeepPath = path.join(logsDir, '.gitkeep');
if (!fs.existsSync(logsGitkeepPath)) {
    fs.writeFileSync(logsGitkeepPath, '# Keep this directory');
    console.log('✅ Created logs/.gitkeep');
}

// Display final setup instructions
console.log('\n🎉 Setup completed successfully!\n');
console.log('📋 Next steps:');
console.log('1. Run "npm install" to install dependencies');
console.log('2. Run "npm start" to start the server');
console.log('3. Open http://localhost:3000 in your browser');
console.log('4. Login with admin credentials to get started\n');

console.log('👤 Default Admin Account:');
console.log('   Email: admin@empowernyamagabe.org');
console.log('   Password: admin123');
console.log('   ⚠️  Please change this password after first login!\n');

console.log('📝 Configuration:');
console.log('   - Edit .env file to customize settings');
console.log('   - Database will be created automatically');
console.log('   - Check README.md for detailed documentation\n');

console.log('🔧 Development commands:');
console.log('   npm start     - Start production server');
console.log('   npm run dev   - Start development server with auto-reload');
console.log('   npm run setup - Run this setup script again\n');

console.log('✨ Your Empower Nyamagabe platform is ready to transform lives!');
