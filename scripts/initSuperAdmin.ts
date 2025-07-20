#!/usr/bin/env node

/**
 * CLI Script for Super Admin Initialization
 * Usage: npx ts-node scripts/initSuperAdmin.ts
 * Location: scripts/initSuperAdmin.ts
 */

import mongoose from "mongoose";
import readline from "readline";
import crypto from "crypto";
import User from "../src/models/User";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

interface SuperAdminConfig {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    password: string;
    tempPassword: boolean;
}

class SuperAdminSeeder {
    private static async connectDatabase(): Promise<void> {
        try {
            const mongoUri = process.env.MONGODB_URI!;
            await mongoose.connect(mongoUri);
            console.log("✅ Database connected successfully");
        } catch (error) {
            console.error("❌ Database connection failed:", error);
            process.exit(1);
        }
    }

    private static async checkExistingSuperAdmin(): Promise<boolean> {
        const existingSuperAdmin = await User.findOne({ role: "super_admin" });
        return !!existingSuperAdmin;
    }

    private static async promptUser(question: string): Promise<string> {
        return new Promise((resolve) => {
            rl.question(question, (answer) => {
                resolve(answer.trim());
            });
        });
    }

    private static async promptPassword(question: string): Promise<string> {
        return new Promise((resolve, reject) => {
            // Store original stdin state
            const originalRawMode = process.stdin.isRaw;
            const originalEncoding = process.stdin.readableEncoding;

            try {
                process.stdout.write(question);
                process.stdin.setRawMode(true);
                process.stdin.resume();
                process.stdin.setEncoding('utf8');

                let password = '';

                const cleanup = () => {
                    process.stdin.setRawMode(originalRawMode);
                    process.stdin.pause();
                    process.stdin.removeListener('data', dataListener);
                    process.stdin.removeListener('error', errorListener);
                    if (originalEncoding) {
                        process.stdin.setEncoding(originalEncoding);
                    }
                };

                const dataListener = (chunk: string | Buffer) => {
                    const input = chunk.toString();

                    for (let i = 0; i < input.length; i++) {
                        const char = input[i];

                        if (char === '\n' || char === '\r') {
                            // Enter key - submit password
                            cleanup();
                            process.stdout.write('\n');
                            resolve(password);
                            return;
                        } else if (char === '\u0003') {
                            // Ctrl+C - exit
                            cleanup();
                            process.stdout.write('\n');
                            process.exit(0);
                        } else if (char === '\u007f' || char === '\b') {
                            // Backspace
                            if (password.length > 0) {
                                password = password.slice(0, -1);
                                process.stdout.write('\b \b');
                            }
                        } else if (char === '\u001b') {
                            // ESC key - cancel
                            cleanup();
                            process.stdout.write('\n');
                            reject(new Error('Password input cancelled'));
                            return;
                        } else if (char >= ' ' && char <= '~') {
                            // Printable ASCII characters only
                            password += char;
                            process.stdout.write('*');
                        }
                        // Ignore other control characters
                    }
                };

                const errorListener = (error: Error) => {
                    cleanup();
                    reject(error);
                };

                process.stdin.on('data', dataListener);
                process.stdin.on('error', errorListener);

            } catch (error) {
                // Restore stdin state on error
                process.stdin.setRawMode(originalRawMode);
                if (originalEncoding) {
                    process.stdin.setEncoding(originalEncoding);
                }
                reject(error);
            }
        });
    }

    private static validatePassword(password: string): { valid: boolean; message?: string } {
        if (password.length < 8) {
            return { valid: false, message: "Password must be at least 8 characters long" };
        }

        const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
        if (!strongPasswordRegex.test(password)) {
            return {
                valid: false,
                message: "Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character"
            };
        }

        return { valid: true };
    }

    private static validateEmail(email: string): boolean {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    private static async interactiveSetup(): Promise<SuperAdminConfig> {
        console.log("\n🔧 Interactive Super Admin Setup");
        console.log("=".repeat(50));

        const firstName = await this.promptUser("Enter first name: ");
        const lastName = await this.promptUser("Enter last name: ");

        let email: string;
        do {
            email = await this.promptUser("Enter email: ");
            if (!this.validateEmail(email)) {
                console.log("❌ Invalid email format. Please try again.");
            }
        } while (!this.validateEmail(email));

        const phone = await this.promptUser("Enter phone (optional): ");

        const setupType = await this.promptUser("Setup type (1: Custom password, 2: Generate temporary password): ");

        let password: string = "";
        let tempPassword = false;

        if (setupType === "2") {
            password = crypto.randomBytes(16).toString('hex');
            tempPassword = true;
            console.log(`\n🔑 Generated temporary password: ${password}`);
            console.log("⚠️  User will be forced to change password on first login");
        } else {
            let passwordValid = false;
            do {
                try {
                    password = await this.promptPassword("Enter password: ");
                    const validation = this.validatePassword(password);
                    if (!validation.valid) {
                        console.log(`❌ ${validation.message}`);
                    } else {
                        const confirmPassword = await this.promptPassword("Confirm password: ");
                        if (password !== confirmPassword) {
                            console.log("❌ Passwords do not match. Please try again.");
                        } else {
                            passwordValid = true;
                        }
                    }
                } catch (error: any) {
                    console.log(`❌ ${error.message}`);
                }
            } while (!passwordValid);
        }

        return {
            firstName,
            lastName,
            email,
            phone: phone || undefined,
            password,
            tempPassword
        };
    }

    private static async environmentSetup(): Promise<SuperAdminConfig> {
        console.log("\n🌍 Environment-based Setup");
        console.log("=".repeat(50));

        const requiredEnvVars = [
            'SUPER_ADMIN_EMAIL',
            'SUPER_ADMIN_FIRST_NAME',
            'SUPER_ADMIN_LAST_NAME'
        ];

        for (const envVar of requiredEnvVars) {
            if (!process.env[envVar]) {
                throw new Error(`Missing required environment variable: ${envVar}`);
            }
        }

        const password = process.env.SUPER_ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');
        const tempPassword = !process.env.SUPER_ADMIN_PASSWORD;

        if (tempPassword) {
            console.log(`🔑 Generated temporary password: ${password}`);
            console.log("⚠️  Add SUPER_ADMIN_PASSWORD to environment for custom password");
        }

        return {
            firstName: process.env.SUPER_ADMIN_FIRST_NAME!,
            lastName: process.env.SUPER_ADMIN_LAST_NAME!,
            email: process.env.SUPER_ADMIN_EMAIL!,
            phone: process.env.SUPER_ADMIN_PHONE,
            password,
            tempPassword
        };
    }

    private static async createSuperAdmin(config: SuperAdminConfig): Promise<void> {
        try {
            const userData = {
                firstName: config.firstName,
                lastName: config.lastName,
                email: config.email,
                phone: config.phone,
                password: config.password,
                role: "super_admin" as const,
                status: "active" as const,
                isActive: true,
                mustChangePassword: config.tempPassword,
                tempPassword: config.tempPassword
            };

            const superAdmin = await User.createUser(userData);

            console.log("\n✅ Super Admin created successfully!");
            console.log("=".repeat(50));
            console.log(`Name: ${superAdmin.fullName}`);
            console.log(`Email: ${superAdmin.email}`);
            console.log(`Role: ${superAdmin.role}`);
            console.log(`Status: ${superAdmin.status}`);

            if (config.tempPassword) {
                console.log("\n⚠️  IMPORTANT SECURITY NOTES:");
                console.log("- This is a temporary password");
                console.log("- User must change password on first login");
                console.log("- Enable 2FA after first login");
                console.log("- Store this password securely");
            }

        } catch (error: any) {
            console.error("❌ Error creating super admin:", error.message);
            process.exit(1);
        }
    }

    private static async resetExistingSuperAdmin(): Promise<void> {
        const confirm = await this.promptUser("Are you sure you want to reset the existing super admin? (yes/no): ");

        if (confirm.toLowerCase() !== 'yes') {
            console.log("❌ Operation cancelled");
            process.exit(0);
        }

        // Additional confirmation
        const finalConfirm = await this.promptUser("This will delete the existing super admin. Type 'DELETE' to confirm: ");

        if (finalConfirm !== 'DELETE') {
            console.log("❌ Operation cancelled");
            process.exit(0);
        }

        await User.deleteMany({ role: "super_admin" });
        console.log("✅ Existing super admin removed");
    }

    public static async run(): Promise<void> {
        console.log("🚀 Super Admin Initialization Script");
        console.log("=".repeat(50));

        try {
            await this.connectDatabase();

            // Check if super admin already exists
            const existingSuperAdmin = await this.checkExistingSuperAdmin();

            if (existingSuperAdmin) {
                console.log("⚠️  Super admin already exists!");
                const action = await this.promptUser("Choose action (1: Exit, 2: Reset existing): ");

                if (action === "2") {
                    await this.resetExistingSuperAdmin();
                } else {
                    console.log("👋 Exiting...");
                    process.exit(0);
                }
            }

            // Choose setup method
            const setupMethod = await this.promptUser("Setup method (1: Interactive, 2: Environment variables): ");

            let config: SuperAdminConfig;

            if (setupMethod === "2") {
                config = await this.environmentSetup();
            } else {
                config = await this.interactiveSetup();
            }

            // Create super admin
            await this.createSuperAdmin(config);

            console.log("\n🎉 Setup completed successfully!");
            console.log("Next steps:");
            console.log("1. Start your application");
            console.log("2. Login with the super admin credentials");
            console.log("3. Change password if temporary");
            console.log("4. Enable 2FA for enhanced security");
            console.log("5. Create additional admin users as needed");

        } catch (error: any) {
            console.error("❌ Setup failed:", error.message);
            process.exit(1);
        } finally {
            await mongoose.connection.close();
            rl.close();
        }
    }
}

// Run the seeder if this file is executed directly
if (require.main === module) {
    SuperAdminSeeder.run();
}

export default SuperAdminSeeder;