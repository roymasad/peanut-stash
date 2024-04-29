#! /usr/bin/env node

/****
 * 
 * Peanut Stash 1.0.0
 * 
 * By Roy Massaad
 * 
 * Collaborative command line cloud Copy & Paste
 * Quickly stash, pop, send & receive console commands and text with your coding, devops and IT team
 * 
 * https://github.com/roymasad/peanut-stash
 * 
 * License: MIT
 */

import { initializeApp } from 'firebase/app';
import {  getDatabase, 
          ref, 
          get, 
          connectDatabaseEmulator,
          push, 
          set,
          update,
          onValue
       } from 'firebase/database';
import {  getAuth,
          signInWithEmailAndPassword,
          connectAuthEmulator,
       } from "firebase/auth";

import fs from 'fs';
import path from 'path';
import os from 'os';
import machinePkg from 'node-machine-id';
const {machineIdSync} = machinePkg;
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import color from 'picocolors';
import crypto from 'crypto';
import * as prompts from '@clack/prompts'
import { setTimeout } from 'node:timers/promises';
import clipboard from 'clipboardy';

// This project's own libaries
import {  decryptDataSymmetrical, 
          stateMachine,
          } from './peanuts/utilities.js';

// Calculating __dirname this way is needed to get the dotenv to load successfully when the cli app is 
// installed globally from npm using `npm install -g peanut-stash`. Using a relative path wont work.
// https://github.com/nodejs/help/issues/2907#issuecomment-757446568
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// choose which env file to load, prod or local testing (install firebase cli emulators to test)
//config( { path: __dirname + '/config/default-public-server.env' }) 
config( { path: __dirname + '/config/local-testing-server.env' }) 

const firebaseConfig = {
  apiKey: process.env.apiKey,
  authDomain: process.env.authDomain,
  databaseURL: process.env.databaseURL,
  projectId: process.env.projectId,
  // storageBucket: process.env.storageBucket,
  // messagingSenderId: process.env.messagingSenderId,
  // appId: process.env.appId
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase();
const auth = getAuth();

// local testing env for firebase, changing .env loaded doesn seem to work
connectAuthEmulator(auth, "http://127.0.0.1:9099");
connectDatabaseEmulator(db, "127.0.0.1", 9000);

let user = null;

// Function to handle terminal input and write data to Firebase
function proccessInput(action) {

  // Check if user has login information saved previously and load it

  // Define the path of the hidden folder/file in the user's home directory
  const hiddenFolderPath = path.join(os.homedir(), '.peanuts');
  const authFilePath = path.join(hiddenFolderPath, 'session.json');

  // check if cached auth json file exists
  if (fs.existsSync(authFilePath)) {
    const sessionData = fs.readFileSync(authFilePath, 'utf8');

    const sessionJson = JSON.parse(sessionData);

    // Decrypt the email and password summetrically using a machine id as key
    // Half unique to each machine (i had to slice the machine id to 32 bytes from 64)
    const email = decryptDataSymmetrical(sessionJson.email, machineIdSync().slice(0, 32));
    const password = decryptDataSymmetrical(sessionJson.password, machineIdSync().slice(0, 32));

    // Sign in user using saved account info

    // PS: Ideally we would use a custom token, but this will require creating a server endpoint
    // to generate and verify the tokens. To keep this project working on firebase spark plan
    // and to make it very easy/fast to use it with private firebase project (just a json file)
    // i opted out of using custom token for now as it would require deploying a cloud function
    // or a nodejs endpoint to generate and verify the token
    // Using a service account or the admin sdk on this project is not possible
    // as this is a client side public npm console app, we can't have admin access in it
    // because that would be a builtin security risk design archicture problem.
    signInWithEmailAndPassword(auth, email, password)
    .then(async (userCredential) => { 
      user = userCredential.user;

      // Load user's public and private keys from firebase

      // first, make the email compatible with firebase
      // replacing all . with _
      const firebase_email = email.replace(/\./g, '_');

      const publicRef = ref(db, 'users/' + firebase_email + '/public/publicKey');
      const privateRef = ref(db, 'users/' + firebase_email + '/private/privateKey');
      
      const publicKey = await get(publicRef);
      const privateKey = await get(privateRef);

      // Attach the keys to the user's credentials for this session
      user.privateKey = privateKey.val();
      user.publicKey = publicKey.val();

      // TODO: Quick app start testing Testing section, remove
      // console.log("Booting up");
      // process.exit(0);

      // Run state machine based on args and user state
      // db is the firebase database
      // auth is the firebase auth
      // user is the firebase user
      // action is the command line argument (first argument)
      // data is the command line argument concatenated (second argument)
      // args is the raw array of command line arguments
      stateMachine(db, auth, user, action, args);

    }).catch((error) => {
      const errorMessage = error.message;
      console.log(`Error loading cached user: ${errorMessage}`);
      console.log('Try login again or delete ./peanuts/session.json');
    })

  }
  else {
    // User doesn't have login information saved (null)
    // the statemachine will process only the actions to login or register based on user state
    user = null;
    stateMachine(db, auth, user, action, args);
  }

}

// Get command line arguments
const args = process.argv.slice(2);

// Extract data from arguments
// composite join the arguments after the first parameter
// useful to stash text lines (most common use case)
const action = args[0];

// Process the actions from the arguments
// Main entry point
proccessInput(action);

