# Inventory Management System

A full-stack, production-ready Inventory Management System with secure authentication, OTP-based password resets, role-based user management, and advanced inventory tracking.

## Features

- **Authentication & Security:** Secure email-based login and OTP-based password resets using JWT and Ethereal Email.
- **Inventory Tracking:** Real-time inward, outward, transfer, and adjustment operations.
- **User Roles:** Role-based access control (Admin, User) for safe and tailored dashboard views.
- **Data Export:** Advanced reporting with PDF and Excel export functionalities.
- **Responsive Web Design:** Built with Next.js and styled for modern, dynamic aesthetics.

## Setup Instructions

1. **Clone the Repository**
   ```bash
   git clone <repository_url>
   cd stock_inventory
   ```

2. **Install Backend Dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Database & Environment Setup**
   Ensure you have MySQL running locally or via a Docker container.
   Create a `.env` file in the `backend/` directory using the provided template:
   ```bash
   cp .env.example .env
   ```
   Update the database credentials inside `.env` if necessary.

4. **Initialize Database**
   Run the database migration script to construct the schema and seed default users:
   ```bash
   node migrate_users.js
   ```

5. **Start the Backend**
   In the `backend/` directory, start the server:
   ```bash
   npm run dev
   # or npm start
   ```

6. **Start the Frontend**
   Open a new terminal window, navigate to the `prototype/` directory, install dependencies, and start the frontend:
   ```bash
   cd prototype
   npm install
   npm run dev
   ```
   The frontend will be available at [http://localhost:3000](http://localhost:3000).

## Default Login Credentials

- **Email:** admin@example.com
- **Password:** admin123

## OTP Testing Note

Password reset flow utilizes [Ethereal Email](https://ethereal.email/) for safe testing. Please check the backend console output when generating an OTP for the exact preview URL of the reset email.
