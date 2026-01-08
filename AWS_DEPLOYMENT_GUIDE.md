# AWS Deployment Guide - Waitlist Only
**Last Updated:** 2026-01-07
**Deployment Type:** Waitlist Module Only (Supabase Database)
**Estimated Time:** 45-60 minutes
**Cost:** $5-15/month (AWS Free Tier eligible)

---

## 📋 Table of Contents
1. [Prerequisites](#prerequisites)
2. [Supabase Setup](#step-1-supabase-setup)
3. [Prepare Application](#step-2-prepare-application)
4. [AWS Account Setup](#step-3-aws-account-setup)
5. [Choose Deployment Method](#step-4-choose-deployment-method)
6. [Deploy to AWS](#deployment-options)
7. [Configure Domain & SSL](#step-5-configure-domain--ssl)
8. [Post-Deployment](#step-6-post-deployment-verification)
9. [Monitoring & Logs](#step-7-monitoring--logging)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### What You Need:
- ✅ AWS Account (free tier available)
- ✅ Supabase Account (free tier)
- ✅ Domain name (optional, but recommended)
- ✅ Basic terminal/command line knowledge
- ✅ GitHub account (for code deployment)

### Tools to Install:
```bash
# AWS CLI
brew install awscli  # macOS
# or download from: https://aws.amazon.com/cli/

# Node.js (v18+)
node --version  # Should be 18+

# Docker (for local testing)
docker --version
```

---

## Step 1: Supabase Setup

### 1.1 Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Click **"Start your project"**
3. Sign in with GitHub
4. Click **"New Project"**
5. Fill in:
   - **Name:** `skryptaeventos-waitlist`
   - **Database Password:** Generate a strong password (SAVE THIS!)
   - **Region:** Choose closest to your users (e.g., South America - São Paulo)
   - **Pricing Plan:** Free
6. Click **"Create new project"**
7. Wait 2-3 minutes for provisioning

### 1.2 Get Database Connection String

1. In your Supabase project, click **Settings** (⚙️) in the sidebar
2. Click **Database**
3. Scroll to **Connection string**
4. Select **URI** tab
5. Copy the connection string:
   ```
   postgresql://postgres:[YOUR-PASSWORD]@db.xxxxxxxxxxxxx.supabase.co:5432/postgres
   ```
6. Replace `[YOUR-PASSWORD]` with the password you set in step 1.1
7. **SAVE THIS** - you'll need it later

### 1.3 Initialize Database Schema

```bash
# From your project directory
cd ~/Documents/skryptaeventos-api

# Generate Prisma client for waitlist
yarn db:waitlist:generate

# Create .env file with Supabase URL
echo 'SUPABASE_DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres"' >> .env

# Push schema to Supabase
yarn db:waitlist:push
```

### 1.4 Verify Database

1. Go back to Supabase dashboard
2. Click **Table Editor** in sidebar
3. You should see `waitlist` table
4. Check columns: id, church_name, responsible_name, email, whatsapp, city, created_at, updated_at

✅ **Supabase is ready!**

---

## Step 2: Prepare Application

### 2.1 Create Production Environment File

Create `.env.production`:

```bash
# ============================================
# PRODUCTION ENVIRONMENT VARIABLES
# ============================================

# === CRITICAL SETTINGS ===
NODE_ENV="production"
PORT=3000

# === ROUTE BLOCKING (IMPORTANT!) ===
# Blocks all routes except /waitlist
BLOCK_PRODUCTION_ROUTES="true"

# === SUPABASE DATABASE ===
SUPABASE_DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres"

# === CORS (YOUR FRONTEND DOMAINS) ===
# Replace with your actual frontend URL
CORS_ORIGIN="https://yourdomain.com"

# === JWT SECRET (REQUIRED EVEN IF NOT USED) ===
# Generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
JWT_SECRET="GENERATE_YOUR_SECRET_HERE"

# === OPTIONAL (Can leave as-is) ===
LOG_LEVEL="info"
APP_URL="https://api.yourdomain.com"

# === NOT NEEDED FOR WAITLIST ===
# DATABASE_URL - Not needed (using Supabase)
# ASAAS_API_KEY - Not needed (no payments)
# AWS_ACCESS_KEY_ID - Not needed (no emails)
```

### 2.2 Generate JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copy the output and paste it in `.env.production` as `JWT_SECRET`

### 2.3 Build Application Locally (Test)

```bash
# Install dependencies
yarn install

# Build
yarn build

# Test production build locally
NODE_ENV=production SUPABASE_DATABASE_URL="your-url" BLOCK_PRODUCTION_ROUTES="true" CORS_ORIGIN="http://localhost:3000" JWT_SECRET="your-secret" node dist/main.js
```

Should see: `🚀 Application is running on: http://localhost:3000/api`

Test it:
```bash
curl -X POST http://localhost:3000/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{"churchName":"Test Church","responsibleName":"Test User","email":"test@example.com","whatsapp":"5511999999999","city":"São Paulo"}'
```

Should return 201 with success message.

Stop the server (Ctrl+C)

✅ **Application is ready!**

---

## Step 3: AWS Account Setup

### 3.1 Create AWS Account

1. Go to [https://aws.amazon.com](https://aws.amazon.com)
2. Click **"Create an AWS Account"**
3. Follow the registration process
4. **Billing:** Add credit card (free tier available)
5. **Support Plan:** Choose "Basic Support - Free"

### 3.2 Configure AWS CLI

```bash
# Configure AWS credentials
aws configure

# It will ask:
# AWS Access Key ID: [Get from IAM Console]
# AWS Secret Access Key: [Get from IAM Console]
# Default region: us-east-1 (or sa-east-1 for Brazil)
# Default output format: json
```

**To get Access Keys:**
1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam/)
2. Click **Users** → **Your username**
3. Click **Security credentials**
4. Click **Create access key**
5. Choose **"CLI"**
6. Download the credentials

---

## Step 4: Choose Deployment Method

We have 3 options (ordered by simplicity):

| Method | Difficulty | Cost | Best For | Auto-Scaling |
|--------|-----------|------|----------|--------------|
| **🟢 AWS App Runner** | Easy | $5-15/month | Quick deployment | ✅ Yes |
| **🟡 Elastic Beanstalk** | Medium | $10-25/month | Full control | ✅ Yes |
| **🔴 ECS Fargate** | Advanced | $15-30/month | Production-grade | ✅ Yes |

**Recommendation:** Start with **AWS App Runner** (easiest) or **Elastic Beanstalk** (more features)

---

## Deployment Options

# Option A: AWS App Runner (RECOMMENDED - EASIEST)

## Prerequisites
- GitHub account
- Code pushed to GitHub repository

## Steps

### A.1 Push Code to GitHub

```bash
# If not already a git repo
git init
git add .
git commit -m "Initial commit - Waitlist module"

# Create repo on GitHub, then:
git remote add origin https://github.com/yourusername/skryptaeventos-api.git
git branch -M main
git push -u origin main
```

### A.2 Create Dockerfile

Create `Dockerfile` in project root:

```dockerfile
# Production Dockerfile for AWS App Runner
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma client for waitlist
RUN yarn db:waitlist:generate

# Build application
RUN yarn build

# Production image
FROM node:18-alpine

WORKDIR /app

# Copy built files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "dist/main.js"]
```

### A.3 Create Health Check Endpoint

Create `src/health/health.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
```

Create `src/health/health.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

Add to `app.module.ts`:

```typescript
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // ... other imports
    HealthModule,  // Add this
  ],
})
```

### A.4 Test Docker Build Locally

```bash
# Build image
docker build -t skryptaeventos-api .

# Test run
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e BLOCK_PRODUCTION_ROUTES=true \
  -e SUPABASE_DATABASE_URL="your-url" \
  -e CORS_ORIGIN="http://localhost:3000" \
  -e JWT_SECRET="your-secret" \
  skryptaeventos-api

# Test
curl http://localhost:3000/api/health
curl -X POST http://localhost:3000/api/waitlist -H "Content-Type: application/json" -d '{"churchName":"Test","responsibleName":"Test","email":"test@test.com","whatsapp":"5511999999999","city":"SP"}'
```

### A.5 Push to GitHub

```bash
git add Dockerfile src/health/
git commit -m "Add Docker support and health check"
git push origin main
```

### A.6 Deploy to AWS App Runner

1. Go to [AWS App Runner Console](https://console.aws.amazon.com/apprunner/)
2. Click **"Create service"**

**Step 1: Source**
- Source: **Source code repository**
- Connect to GitHub:
  - Click **"Add new"**
  - Connect to GitHub
  - Choose your repository
  - Branch: `main`
- Deployment trigger: **Automatic**
- Click **Next**

**Step 2: Build settings**
- Build command: (leave default)
- Start command: `node dist/main.js`
- Port: `3000`
- Click **Next**

**Step 3: Configure service**
- Service name: `skryptaeventos-api`
- CPU: 1 vCPU
- Memory: 2 GB
- **Environment variables** (Click "Add environment variable"):
  ```
  NODE_ENV = production
  BLOCK_PRODUCTION_ROUTES = true
  SUPABASE_DATABASE_URL = [your-supabase-url]
  CORS_ORIGIN = https://yourdomain.com
  JWT_SECRET = [your-generated-secret]
  PORT = 3000
  ```
- Auto-scaling: Min 1, Max 5
- Health check: `/api/health`
- Security: Choose "Create new IAM role"
- Click **Next**

**Step 4: Review**
- Review all settings
- Click **Create & deploy**

⏳ Wait 5-10 minutes for deployment...

### A.7 Get Your API URL

1. Once deployed, you'll see your App Runner URL:
   ```
   https://xxxxx.us-east-1.awsapprunner.com
   ```

2. Test it:
   ```bash
   curl https://xxxxx.us-east-1.awsapprunner.com/api/health
   ```

✅ **App Runner Deployment Complete!**

---

# Option B: AWS Elastic Beanstalk (MORE FEATURES)

### B.1 Install EB CLI

```bash
pip install awsebcli --upgrade --user
eb --version
```

### B.2 Initialize Elastic Beanstalk

```bash
# In your project directory
eb init

# Answer prompts:
# Region: 10 (us-east-1) or 9 (sa-east-1 for Brazil)
# Application name: skryptaeventos-api
# Platform: Docker
# Do you want to set up SSH: Yes (recommended)
# Select keypair: Create new or use existing
```

### B.3 Create Environment Configuration

Create `.ebextensions/environment.config`:

```yaml
option_settings:
  aws:elasticbeanstalk:application:environment:
    NODE_ENV: production
    PORT: 3000
    BLOCK_PRODUCTION_ROUTES: "true"

  aws:elasticbeanstalk:environment:proxy:
    ProxyServer: none

  aws:autoscaling:launchconfiguration:
    InstanceType: t3.small

  aws:elasticbeanstalk:environment:
    EnvironmentType: LoadBalanced
    LoadBalancerType: application
```

### B.4 Create Dockerfile (same as App Runner)

Use the Dockerfile from Option A.

### B.5 Set Environment Variables

```bash
# Set environment variables (do this for all variables)
eb setenv SUPABASE_DATABASE_URL="your-url"
eb setenv CORS_ORIGIN="https://yourdomain.com"
eb setenv JWT_SECRET="your-secret"
```

### B.6 Create and Deploy

```bash
# Create environment
eb create skryptaeventos-prod \
  --instance-type t3.small \
  --elb-type application \
  --envvars BLOCK_PRODUCTION_ROUTES=true,NODE_ENV=production

# This will take 5-10 minutes...
```

### B.7 Check Status

```bash
eb status
eb open  # Opens your app in browser
```

### B.8 Get URL

```bash
eb status | grep "CNAME"
```

Your API will be at: `http://skryptaeventos-prod.xxxxx.elasticbeanstalk.com`

✅ **Elastic Beanstalk Deployment Complete!**

---

# Option C: ECS Fargate (ADVANCED - PRODUCTION-GRADE)

### C.1 Create ECR Repository

```bash
# Create repository
aws ecr create-repository --repository-name skryptaeventos-api --region us-east-1
```

### C.2 Build and Push Docker Image

```bash
# Login to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com

# Build image
docker build -t skryptaeventos-api .

# Tag image
docker tag skryptaeventos-api:latest YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/skryptaeventos-api:latest

# Push image
docker push YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/skryptaeventos-api:latest
```

### C.3 Create ECS Cluster

1. Go to [ECS Console](https://console.aws.amazon.com/ecs/)
2. Click **"Create Cluster"**
3. Choose **"Networking only" (Fargate)**
4. Name: `skryptaeventos-cluster`
5. Click **Create**

### C.4 Create Task Definition

1. Click **"Task Definitions"** → **"Create new Task Definition"**
2. Choose **"Fargate"**
3. Configure:
   - **Task Definition Name:** `skryptaeventos-task`
   - **Task Role:** None (for now)
   - **Task execution role:** Create new role
   - **Task memory:** 2 GB
   - **Task CPU:** 1 vCPU

4. **Add Container:**
   - Name: `skryptaeventos-api`
   - Image: `YOUR_ACCOUNT_ID.dkr.ecr.us-east-1.amazonaws.com/skryptaeventos-api:latest`
   - Memory: 2048
   - Port mappings: 3000
   - **Environment variables:**
     ```
     NODE_ENV = production
     BLOCK_PRODUCTION_ROUTES = true
     SUPABASE_DATABASE_URL = [your-url]
     CORS_ORIGIN = https://yourdomain.com
     JWT_SECRET = [your-secret]
     PORT = 3000
     ```
   - Health check: `CMD-SHELL,curl -f http://localhost:3000/api/health || exit 1`

5. Click **Create**

### C.5 Create Service

1. In your cluster, click **"Create Service"**
2. Configure:
   - Launch type: Fargate
   - Task Definition: `skryptaeventos-task`
   - Service name: `skryptaeventos-service`
   - Number of tasks: 1
   - Min/Max: 1/5 (auto-scaling)

3. **Load balancer:**
   - Type: Application Load Balancer
   - Create new load balancer
   - Listener port: 80
   - Target group: Create new
   - Health check path: `/api/health`

4. **Auto Scaling:**
   - Min: 1
   - Max: 5
   - Target CPU: 70%

5. Click **Create Service**

### C.6 Get Load Balancer URL

1. Go to **EC2** → **Load Balancers**
2. Find your load balancer
3. Copy DNS name: `xxxxx.us-east-1.elb.amazonaws.com`

✅ **ECS Fargate Deployment Complete!**

---

## Step 5: Configure Domain & SSL

### 5.1 Get SSL Certificate (AWS Certificate Manager)

1. Go to [AWS Certificate Manager](https://console.aws.amazon.com/acm/)
2. Click **"Request a certificate"**
3. Choose **"Request a public certificate"**
4. Domain names:
   - `api.yourdomain.com`
   - `*.yourdomain.com` (wildcard - optional)
5. Validation method: **DNS validation**
6. Click **Request**

### 5.2 Validate Domain

1. Click on your certificate
2. Click **"Create records in Route 53"** (if using Route 53)
3. OR copy CNAME records and add to your DNS provider
4. Wait for validation (5-30 minutes)

### 5.3 Configure Custom Domain

**For App Runner:**
1. Go to your App Runner service
2. Click **"Custom domains"**
3. Click **"Link domain"**
4. Enter: `api.yourdomain.com`
5. Add DNS records to your provider as shown

**For Elastic Beanstalk/ECS:**
1. Go to **Route 53** → **Hosted zones**
2. Click your domain
3. **Create record:**
   - Type: A (Alias)
   - Name: `api`
   - Alias target: Your load balancer
   - Click **Create**

### 5.4 Enable HTTPS

**For App Runner:**
- Automatic with custom domain

**For Elastic Beanstalk:**
```bash
eb elb enable-https --certificate-arn arn:aws:acm:us-east-1:xxxxx:certificate/xxxxx
```

**For ECS:**
1. Go to **EC2** → **Load Balancers**
2. Click your load balancer
3. **Listeners** → **Add listener**
4. Protocol: HTTPS
5. Port: 443
6. Default action: Forward to target group
7. SSL certificate: Choose from ACM
8. Click **Add**

✅ **Domain & SSL Configured!**

---

## Step 6: Post-Deployment Verification

### 6.1 Test Health Endpoint

```bash
curl https://api.yourdomain.com/api/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "2026-01-07T...",
  "uptime": 123.45
}
```

### 6.2 Test Waitlist Endpoint

```bash
curl -X POST https://api.yourdomain.com/api/waitlist \
  -H "Content-Type: application/json" \
  -d '{
    "churchName": "Test Church",
    "responsibleName": "Test User",
    "email": "test@example.com",
    "whatsapp": "5511999999999",
    "city": "São Paulo"
  }'
```

Should return 201:
```json
{
  "message": "Cadastro realizado com sucesso! Entraremos em contato em breve.",
  "data": {
    "id": "...",
    "email": "test@example.com",
    "churchName": "Test Church",
    "createdAt": "..."
  }
}
```

### 6.3 Test Route Blocking

```bash
curl https://api.yourdomain.com/api/auth/register
```

Should return 403:
```json
{
  "statusCode": 403,
  "message": "Esta funcionalidade está em desenvolvimento. Apenas a lista de espera está disponível no momento."
}
```

### 6.4 Test CORS

```bash
curl -H "Origin: https://unauthorized-domain.com" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS \
  https://api.yourdomain.com/api/waitlist -v
```

Should NOT include `Access-Control-Allow-Origin` header

✅ **All tests passing!**

---

## Step 7: Monitoring & Logging

### 7.1 Enable CloudWatch Logs

**For App Runner:**
- Automatic - logs available in CloudWatch

**For Elastic Beanstalk:**
```bash
eb logs
eb logs --stream  # Live logs
```

**For ECS:**
1. Already configured in task definition
2. Go to **CloudWatch** → **Log groups**
3. Find `/ecs/skryptaeventos-task`

### 7.2 Create CloudWatch Dashboard

1. Go to [CloudWatch Console](https://console.aws.amazon.com/cloudwatch/)
2. Click **"Dashboards"** → **"Create dashboard"**
3. Name: `SkryptaEventos-API`
4. Add widgets:
   - **Requests:** ALB/App Runner request count
   - **Errors:** 4xx, 5xx responses
   - **Latency:** Response time
   - **CPU/Memory:** Resource usage

### 7.3 Set Up Alarms

```bash
# Create alarm for high error rate
aws cloudwatch put-metric-alarm \
  --alarm-name skryptaeventos-high-errors \
  --alarm-description "Alert on high error rate" \
  --metric-name 5XXError \
  --namespace AWS/ApplicationELB \
  --statistic Sum \
  --period 300 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1
```

### 7.4 View Logs

```bash
# App Runner
aws logs tail /aws/apprunner/skryptaeventos-api/xxxxx/application --follow

# Elastic Beanstalk
eb logs --stream

# ECS
aws logs tail /ecs/skryptaeventos-task --follow
```

---

## Troubleshooting

### Issue: Container fails to start

**Check:**
```bash
# View logs
aws logs tail /aws/apprunner/... --follow

# Common issues:
# 1. Missing environment variables
# 2. Invalid SUPABASE_DATABASE_URL
# 3. Port mismatch (should be 3000)
```

**Fix:**
- Verify all environment variables are set
- Check CloudWatch logs for specific error

### Issue: 403 on all routes

**Check:**
```bash
# Verify BLOCK_PRODUCTION_ROUTES is set correctly
aws apprunner describe-service --service-arn your-arn | grep BLOCK_PRODUCTION_ROUTES
```

**Fix:**
- Should be `"true"` (string, not boolean)

### Issue: CORS errors

**Check:**
- Verify `CORS_ORIGIN` matches your frontend domain EXACTLY
- Include protocol: `https://yourdomain.com` (not `yourdomain.com`)

**Fix:**
```bash
# Update environment variable
eb setenv CORS_ORIGIN="https://yourdomain.com"
# or update in App Runner console
```

### Issue: Database connection fails

**Check:**
```bash
# Test connection from your machine
psql "postgresql://postgres:PASSWORD@db.xxxxx.supabase.co:5432/postgres"
```

**Fix:**
- Verify Supabase password is correct
- Check if URL is properly escaped in environment variable
- Ensure Supabase project is active

### Issue: Health check failing

**Check:**
- Access `/api/health` endpoint directly
- Check if port 3000 is exposed

**Fix:**
- Verify health endpoint returns 200
- Check Dockerfile EXPOSE directive

---

## Cost Estimation

### AWS App Runner
- **Free tier:** 5000 build minutes/month
- **After free tier:**
  - 1 vCPU, 2 GB RAM: ~$12/month
  - Data transfer: ~$1/month
- **Total:** ~$13/month

### Elastic Beanstalk
- **Instance (t3.small):** ~$15/month
- **Load balancer:** ~$16/month
- **Data transfer:** ~$1/month
- **Total:** ~$32/month

### ECS Fargate
- **Task (1 vCPU, 2 GB):** ~$15/month
- **Load balancer:** ~$16/month
- **Data transfer:** ~$1/month
- **Total:** ~$32/month

### Supabase
- **Free tier:** $0 (up to 500MB, 2GB bandwidth)

**Recommended Total:** $13-32/month depending on deployment method

---

## Next Steps

1. ✅ Monitor first 24 hours closely
2. ✅ Set up automated backups (Supabase does this)
3. ✅ Configure alerts for errors/downtime
4. ✅ Test from your frontend application
5. ✅ Share API URL with frontend team

---

## Quick Reference

### Useful Commands

```bash
# App Runner
aws apprunner list-services
aws apprunner describe-service --service-arn arn:...

# Elastic Beanstalk
eb status
eb logs --stream
eb deploy
eb terminate  # Delete environment

# ECS
aws ecs list-services --cluster skryptaeventos-cluster
aws ecs describe-services --cluster skryptaeventos-cluster --services skryptaeventos-service

# Logs
aws logs tail /aws/apprunner/... --follow
eb logs --stream
aws logs tail /ecs/... --follow
```

### Environment Variables Checklist

```bash
✅ NODE_ENV=production
✅ PORT=3000
✅ BLOCK_PRODUCTION_ROUTES=true
✅ SUPABASE_DATABASE_URL=postgresql://...
✅ CORS_ORIGIN=https://yourdomain.com
✅ JWT_SECRET=<64-char-hex>
```

---

## Support

**AWS Documentation:**
- [App Runner](https://docs.aws.amazon.com/apprunner/)
- [Elastic Beanstalk](https://docs.aws.amazon.com/elastic-beanstalk/)
- [ECS](https://docs.aws.amazon.com/ecs/)

**Supabase Documentation:**
- [Supabase Docs](https://supabase.com/docs)

**Need Help?**
- AWS Support (if you have a support plan)
- Supabase Discord: [discord.supabase.com](https://discord.supabase.com)

---

**🎉 Congratulations! Your API is now deployed to AWS!**
