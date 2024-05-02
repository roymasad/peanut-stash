import fetch from 'node-fetch';
import crypto from 'crypto';
import color from 'picocolors';
import figlet from "figlet";
import * as prompts from '@clack/prompts'
import clipboard from 'clipboardy';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {read} from 'read';

import {  ref, 
          push, 
          get, 
          remove,
} from 'firebase/database';

import {  loginUser,
          logoutUser,
          manageUsers,
          resetPassword,
          registerUser } from './users.js';

import {  stashPeanut,
          listPeanuts,
          popPeanut } from './stash.js';

// Show console help arguments
export function showArgs() {
    console.log(`\n${color.cyan('Peanut Stash 1.0.9')} - Collaborative command line cloud Stash, Share, Copy & Paste tool.\n`);
    console.log("Quickly stash, pop, send & receive console commands and text with your coding, IT, devops teams\n")
    console.log(`${color.yellow("Arguments Usage:\n")}`);
  
    console.log(`register (r) <email>\t\t\t ${color.cyan('Register new account')}`);
    console.log(`login (i) <email>\t\t\t ${color.cyan('Login')}`);
    console.log(`logout (o) \t\t\t\t ${color.cyan('Logout')}`);
    console.log(`reset (rs)\t\t\t\t ${color.cyan('Reset password')}\n`);

    console.log(`users (u) \t\t\t\t ${color.cyan('Manage all connected users')}\n`);

    console.log(`categories (c) \t\t\t\t ${color.cyan('Manage categories')}\n`);
  
    console.log(`server (sv) \t\t\t\t ${color.cyan('Use default or custom firebase server (web app creds)\n')}`);
  
    console.log(`stash (s)\t\t\t\t ${color.cyan('Stash a text peanut')}`);
    console.log(`pop (p) \t\t\t\t ${color.cyan('Pop stashed text. Asks to display, copy or exec')}`);
    console.log(`list (l) \t\t\t\t ${color.cyan('Manage all stashed peanuts')}\n`);

    console.log(`askGemini (ai) \t\t\t\t ${color.cyan('Infer command lines using Gemini v1 API Key')}\n`);

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

      // Configure Server chosen
      case 'askGemini':
      case 'ai':
        askAI(user, db);
      break;

      // Configure Server chosen
      case 'categories':
      case 'c':
        manageCategories(user, db);
      break;

      // Configure Server chosen
      case 'server':
      case 'sv':
        manageServer();
      break;

      // Stash a text peanut in your account
      case 'users':
      case 'u':
        manageUsers(user, db);
        break;

      // Stash a text peanut in your account
      case 'pop':
        case 'p':
          popPeanut(user, db);
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
        console.log(figlet.textSync("Peanut Stash 1.0.9", { horizontalLayout: "full" }));
        console.log(`Quickly stash, pop, send & receive console commands and text with your team.\nHelpful tiny tool for coders, IT and devops who work frequently within the terminal.\n\nUnlike pastebin and its 3rd party tools/ecosystem, this tool and project is more focused on quick efficient terminal commands stashing/sharing and not on code sharing.\nhttps://www.npmjs.com/package/peanut-stash`);
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

    // Configure Server chosen
    case 'server':
      case 'sv':
        manageServer();
      break;

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

// Manage default or custom firebase server
async function manageServer(){

  try {
    // define file locations
    const hiddenFolderPath = path.join(os.homedir(), '.peanuts');
    const authFilePath = path.join(hiddenFolderPath, 'session.json');
    const serverConfFilePath = path.join(hiddenFolderPath, 'server.json');

    let answer_action = await prompts.select({
      message: color.cyan(`Choose Server`),
      options: [  {value: 'default' , label: 'Default Public Server'}, 
                  {value: 'custom' , label: 'Custom Private Server'}]
    });

    if (prompts.isCancel(answer_action)) {
      console.log(color.yellow("Cancelled"));
      process.exit(0);
    }
    
    if (answer_action == 'default') {
      // just remove the server config file if it exist, when the app starts it will use default server
      if (fs.existsSync(serverConfFilePath)) {
        fs.unlinkSync(serverConfFilePath);
      } 
      console.log(color.green("Using default public server"));
      process.exit(0);

    } else if (answer_action == 'custom') {
      
        console.log("Enter your Firebase Web App Custom Project Keys");
      
        try {
          var apiKey = await read({ prompt: `${color.cyan('apiKey:')} `});
          var authDomain = await read({prompt: `${color.cyan('authDomain:')} `});
          var databaseURL = await read({prompt: `${color.cyan('databaseURL:')} `});
          var projectId = await read({prompt: `${color.cyan('projectId:')} `});
          if (apiKey.length == 0 || authDomain.length == 0 || databaseURL.length == 0 || projectId.length == 0)
          {
              console.log(`${color.yellow("Error: Empty text")}`);
              process.exit(0);
          }
        } catch(error) {
            if (error == "Error: canceled")
                console.log(`${color.yellow("Cancelled")}`);
            else console.log(`${color.yellow(error)}`);
            process.exit(0);
        }
    

        let config_json = {
          apiKey: apiKey,
          authDomain: authDomain,
          databaseURL: databaseURL,
          projectId: projectId
        }
    
        // save the config to a file
        fs.writeFileSync(serverConfFilePath, JSON.stringify(config_json));
    
        // log out the user if it is cached
        if (fs.existsSync(authFilePath)) {
          fs.unlinkSync(authFilePath);
        }
        console.log(color.green("Using custom private public server. You need to re-login."));
        process.exit(0);
  
    }

  } catch (error) {
    console.log(error);
    process.exit(1);
  }

  process.exit(0);

}

// Manage Categories
async function manageCategories(user, db){

    // variables and constants for the loop
    const userEmail = user.email;
    const firebase_email = userEmail.replace(/\./g, '_');

    // load categories we can use to stash under
    const categoryRef = ref(db, `users/${firebase_email}/private/categories`);
        
    let categoriesList = []; // for display initially
    let categories = []; // to save extra data such as db ref to be able to delete

    const snapshot = await get(categoryRef);

    try { 
        if (snapshot.exists()) {
            let index = 0;
            snapshot.forEach(element => {
                categories.push({
                    name: element.val().name,
                    databaseRef: element.ref
                });
                categoriesList.push({label: element.val().name, value: `DAT:${index}:` + element.val().name});
                index++;
            });

        } else 
        categoriesList = []; 
    } catch(error) {
        console.log(`${color.red('Error Loading Categories:')} ${error}`);
        process.exit(1);
    }
    categoriesList.reverse(); // latest first

    categoriesList.push({label: color.cyan("#Add#"), value: "ADD:add"}); //bottom
    categoriesList.push({label: color.yellow("Cancel"), value: "CNL:cancel"}); //bottom

    let answer_category = await prompts.select({
      message: 'Select a category',
      options: categoriesList
    });

    if (prompts.isCancel(answer_category)) {
      console.log(color.yellow("Cancelled"));
      process.exit(0);
    }

    if (answer_category.substring(0, 4) == "CNL:") {

      console.log(`${color.green('Cancelled action.')}`);
      process.exit(0);
    }
    else if (answer_category.substring(0, 4) == "ADD:") {

      try {
        var answer = await read({prompt: `${color.cyan('\Add a new category:\n')} `});
        if (answer.length == 0)
        {
            console.log(`${color.yellow("Error: Empty text")}`);
            process.exit(0);
        }
      } catch(error) {
          console.log(`${color.yellow(error)}`);
          process.exit(0);
      }
      
      // save it to database
      await push(categoryRef,{ name : answer });

      console.log(`${color.green('Success: Category added')}`);
      process.exit(0);
    } 
    else if (answer_category.substring(0, 4) == "DAT:") {

      let manage_action = await prompts.select({
        message: 'Select Action',
        options: [
            {label: color.yellow("Cancel"), value: "cancel"},
            {label: `${color.red("#Delete Category#")}`, value: "delete"},
        ]
      });

      if (prompts.isCancel(manage_action)) {
        console.log(color.yellow("Cancelled"));
        process.exit(0);
      }

      if (manage_action == "cancel") {
        console.log(`${color.green('Cancelled action.')}`);
        process.exit(0);
      }
      else if (manage_action == "delete") {

            const shouldDelete = await prompts.confirm({
              message: 'Are you Sure?',
            });

            if (prompts.isCancel(shouldDelete)) {
              console.log(color.yellow("Cancelled"));
              process.exit(0);
            }

            if (shouldDelete) {
              // select and remove prefix
              answer_category = answer_category.slice(4);
              // get database ref to remove
              let [metaDataIndex, category] = answer_category.split(':');
              category = answer_category.substring(answer_category.indexOf(':') + 1);
              await remove(categories[metaDataIndex].databaseRef);
              
              console.log(`${color.green('Success: Category deleted. Existing peanut stash not affected. Re-categorize them.')}`);
              process.exit(0);
            } else {
              console.log(`${color.green('Cancelled action.')}`);
              process.exit(0);
            }
      }    
      process.exit(0); // code should not reach here (inreccorrect usage)
    }
    process.exit(0);
}

// Ask AI(Gemini using API keys) to infer commands for you
// Then select what do do with them (print/execute/clipboard/save/cancel)
async function askAI(user, db) {

  // first check if there is a ai.json json file saved in ~/.peanuts

    // define file locations
    const hiddenFolderPath = path.join(os.homedir(), '.peanuts');
    const AIConfFilePath = path.join(hiddenFolderPath, 'ai.json');

  if (fs.existsSync(AIConfFilePath)) {

    console.log("AI configuration found");

    // load api key
    const aiData = fs.readFileSync(AIConfFilePath, 'utf8');
    var aiJSON = JSON.parse(aiData);

    // check if it is for gemini, for future support for other providers
    if (aiJSON.provider != "geminiV1") {
      console.log(color.yellow("AI configuration present is not for Gemini. Exiting. Delete ~/.peanuts/ai.json and add new api key."));
      process.exit(0);
    }

    let answer_action = await prompts.select({
      message: color.cyan(`Choose Action`),
      options: [  {value: 'generate' , label: color.cyan('Generate console command')}, 
                  {value: 'remove' , label: color.red('# Delete current API Key #')}]
    });

    if (prompts.isCancel(answer_action)) {
      console.log(color.yellow("Cancelled"));
      process.exit(0);
    }

    // Generate or delete actions
    if (answer_action == 'generate') {

      console.log(color.magenta("Important: Only ask about a console command to create, no other topic, and be concise."));

      try {

        var geminiQuetion = await read({prompt: `${color.cyan('How do i create a console command to.. ')} `});
        if (geminiQuetion.length == 0)
        {
          console.log(`${color.yellow("Error: Empty text")}`);
          process.exit(0);
        }

        var geminiResponse = await generateGeminiAnswers(geminiQuetion, aiJSON.apiKey, 'generate');

        console.log("");
        console.log(color.green(geminiResponse));
        console.log("");

        process.exit(0);

      } catch(error) {
        if (error == "Error: canceled")
            console.log(`${color.yellow("Cancelled")}`);
        else console.log(`${color.yellow(error)}`);
        process.exit(0);
      }
      
    } else if (answer_action == 'remove') {
      
      const shouldDelete = await prompts.confirm({
        message: 'Are you Sure?',
      });

      if (prompts.isCancel(shouldDelete)) {
        console.log(color.yellow("Cancelled"));
        process.exit(0);
      }

      if (shouldDelete) {
        // remove the config file
        fs.unlinkSync(AIConfFilePath);
        console.log(`${color.green('Success: gemini API key removed. Relogin with new key.')}`);
        process.exit(0);
      } else {
        console.log(`${color.green('Cancelled action.')}`);
        process.exit(0);
      }

    }

    process.exit(0);
  }
  else {
    console.log(color.yellow("AI configuration not found. One is needed to infer commands."));
    // Ask the user to input their gemini API key so we can save as json to AIConfFilePath

    try {
      var geminiAPIKey = await read({prompt: `${color.cyan('Enter Gemini API app key: ')} `});
      if (geminiAPIKey.length == 0)
      {
        console.log(`${color.yellow("Error: Empty text")}`);
        process.exit(0);
      }

      let config_json = {
        apiKey: geminiAPIKey,
        provider : "geminiV1"   // this is for version1 of gemini
      }

      // save the config to a file
      fs.writeFileSync(AIConfFilePath, JSON.stringify(config_json));

      console.log(`${color.green('Success: gemini API key saved. Rerun command.')}`);
      process.exit(0);

    } catch(error) {
        console.log(`${color.yellow(error)}`);
        process.exit(0);
    }

    process.exit(0);

  }

  process.exit(0);

}

// Gemini V1 API inference helper function
export async function generateGeminiAnswers(promptQuestion, apiKey, mode = "generate") {
  
  // add a bit of prompt engineering to limit the discuss to cli command
  if (mode == "generate") 
  {
    promptQuestion = "i need to create a specific computer console command, how do i do the following: START OF QUESTION : " + promptQuestion;
    promptQuestion += ". END OF QUESTION. IMPORTANT NOTES, don't explain, only output the selected command/parameters to run and choose the most suitable recommended relevant answer for this request" 
    promptQuestion += ". also if the question's topic is/was not specifically about cli/terminal/console commands generation in the context of computer coding, devops and IT or if you are in doubt about the question's topic, don't reply, just only say 'Invalid prompt'";        
  }
  else if (mode == "explain")
  {
    promptQuestion = "i need help explaining the following console/terminal computer command: START OF QUESTION:" + promptQuestion;
    promptQuestion += ". END OF QUESTION. IMPORTANT NOTES, limit your answer to a few lines";
    promptQuestion += ". also if the question's topic is/was not specifically about cli/terminal/console commands in the context of computer coding, devops and IT or if you are in doubt about the question's topic, don't reply, just only say 'Invalid prompt'";  
  }
    
  try {
      // Define the request body for the gemini endpoint
      const requestBody = {
        contents: [
          {
            parts: [
              {
                text: promptQuestion
              }
            ]
          }
        ]
      };

      // Define the URL with the API key
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`;

      // Define request options
      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      };

      // Send the request
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      // Parse and return the response data
      const responseData = await response.json();
      const answer = responseData.candidates[0].content.parts[0].text;
      return answer;
  } catch (error) {
      console.error('AI Error:', error);
      process.exit(1)
  }
}
  