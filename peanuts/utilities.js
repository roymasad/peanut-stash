import fetch from 'node-fetch';
import crypto from 'crypto';
import color from 'picocolors';
import figlet from "figlet";
import * as prompts from '@clack/prompts'
import clipboard from 'clipboardy';

import {  loginUser,
          logoutUser,
          manageUsers,
          resetPassword,
          registerUser } from './users.js';

import {  stashPeanut,
          listPeanuts } from './stash.js';

// Show console help arguments
export function showArgs() {
    console.log(`\n${color.cyan('Peanut Stash 1.0.0')} - Collaborative command line cloud Stash, Share, Copy & Paste tool.\n`);
    console.log("Quickly stash, pop, send & receive console commands and text with your coding, IT, devops teams\n")
    console.log(`${color.yellow("Arguments Usage:\n")}`);
  
    console.log(`register (rs) <email>\t\t\t ${color.cyan('Register new account')}`);
    console.log(`login (i) <email>\t\t\t ${color.cyan('Login')}`);
    console.log(`logout (o) \t\t\t\t ${color.cyan('Logout')}`);
    console.log(`reset (r)\t\t\t\t ${color.cyan('Reset password')}\n`);
    console.log(`users (u) \t\t\t\t ${color.cyan('Manage all connected users (active/pending)')}\n`);
  
    console.log(`server (sv) firebase.json \t\t ${color.cyan('Use your custom firebase server json file')}`);
    console.log(`server (sv) default \t\t\t ${color.cyan('Use default provided firebase server')}\n`);
  
    console.log(`stash (s)\t\t\t\t ${color.cyan('Stash a text peanut')}`);
    console.log(`pop (p) \t\t\t\t ${color.cyan('Pop stashed text. Asks to display, copy or exec')}`);
    console.log(`list (l) \t\t\t\t ${color.cyan('Manage all stashed peanuts')}\n`);

    console.log(`about (a) \t\t\t\t ${color.cyan('About Page\n')}`);
  
    console.log(`${color.yellow("Examples:\n")}`);
    console.log(`pnut stash ${color.cyan('or')} pnut s `);
    console.log(`pnut list`);
    console.log(`pnut pop`);
  
    console.log('\n');
  }
  
  // Basic email validator
  export function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  // Helper function to consume API
  export async function fetchJsonAPI(url, type = 'GET', body_args = {}) {
    const response = await fetch(url, {
      method: type,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body_args),
    });
  
    const data = await response.json();
    return data;
  }
  

// Process what to do based on state (user/action)
export function stateMachine(db, auth, user, action, args) {
   
  // User is signed in
  if (user) {
    // https://firebase.google.com/docs/reference/js/auth.user

    // Check console parameters
    switch (action) {

      // Stash a text peanut in your account
      case 'users':
      case 'u':
        manageUsers(user, db);
        break;

      // Stash a text peanut in your account
      case 'stash':
      case 's':
        stashPeanut(user, db);
        break;
      
      // List available peanuts
      case 'list':
      case 'l':
        listPeanuts(user, db);
        break;

      // register new account and send verification email
      case 'register':
      case 'r':
        registerUser(args[1], auth);
        break;

      // Login to existing account
      case "login":
      case "i":
        loginUser(args[1], auth, db);
        break;

      case "logout":
      case "o":
        logoutUser();
        break;

      case "about":
      case "a":
        console.log(figlet.textSync("Peanut Stash 1.0.0", { horizontalLayout: "full" }));
        console.log(`Quickly stash, pop, send & receive console commands and text with your team.\nHelpful tiny tool for coders, IT and devops who work frequently within the terminal.\n\nUnlike pastebin and its 3rd party tools/ecosystem, this tool and project is more focused on quick efficient terminal commands stashing/sharing and not on code sharing.\nhttps://www.npmjs.com/package/peanut-stash-cli`);
        process.exit(0);
        break;

      case "reset":
      case "rs":
        resetPassword(user);
        break;
        
      // Show help message
      default:
        showArgs()
        process.exit(0);
        break;
    
    }

  } else {
    // Current user is not signed in with an account
    // Only commands available to be processedare register, login and about
    switch (action) {

      // register new account and send verification email
      case 'register':
      case 'r':
        registerUser(args[1], auth);
        break;

      case "login":
      case "i":
        loginUser(args[1], auth);
        break;

      case "about":
      case "a":
        console.log(figlet.textSync("Peanut Stash 1.0.0", { horizontalLayout: "full" }));
        console.log(`Quickly stash, pop, send & receive console commands and text with your team.\nHelpful tiny tool for coders and devops who work frequently within the terminal.\n\nUnlike pastebin and its 3rd party tools/ecosystem, this tool and project is more focused on quick efficient terminal commands stashing/sharing and not on code sharing.\nhttps://www.npmjs.com/package/peanut-stash-cli`);
        break;
        
      default:
        showArgs()
        console.log(`${color.red('Error:')} User not signed in\n`);
        process.exit(0);
        break;
    
    }
    
  }

}

// Symetrical encryption/ Function to encrypt the email and password
export function encryptDataSymmetrical(data, encryptionKey) {
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey, iv);
  let encryptedData = cipher.update(data, 'utf8', 'base64');
  encryptedData += cipher.final('base64');
  return iv.toString('base64') + ':' + encryptedData;
}

// Function to decrypt the encrypted email and password
export function decryptDataSymmetrical(encryptedData, encryptionKey) {
  const [iv, encrypted] = encryptedData.split(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', encryptionKey, Buffer.from(iv, 'base64'));
  let decryptedData = decipher.update(encrypted, 'base64', 'utf8');
  decryptedData += decipher.final('utf8');
  return decryptedData;
}

// Function to encrypt a string using the public key
export function encryptStringWithPublicKey(publicKey, text) {
  const buffer = Buffer.from(text, 'utf8');
  const encrypted = crypto.publicEncrypt(publicKey, buffer);
  return encrypted.toString('base64');
}

// Function to decrypt an encrypted string using the private key
export function decryptStringWithPrivateKey(privateKey, encryptedText) {
  const buffer = Buffer.from(encryptedText, 'base64');
  const decrypted = crypto.privateDecrypt(privateKey, buffer);
  return decrypted.toString('utf8');
}
  