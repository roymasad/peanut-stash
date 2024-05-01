import {  getDatabase, 
    ref, 
    child,
    get, 
    set,
    update,
    onValue,
    push
 } from 'firebase/database';
import {  getAuth,
    createUserWithEmailAndPassword,
    sendEmailVerification,
    signInWithEmailAndPassword,
    updatePassword,
    signInWithCustomToken,
    onAuthStateChanged 
 } from "firebase/auth";

import color from 'picocolors';
import { question } from 'readline-sync';
import fs from 'fs';
import path from 'path';
import os from 'os';
import machinePkg from 'node-machine-id';
const {machineIdSync} = machinePkg;
import * as prompts from '@clack/prompts'
import crypto from 'crypto';

import {  encryptDataSymmetrical, 
    decryptDataSymmetrical, 
    isValidEmail, 
    fetchJsonAPI } from './utilities.js';

    // Login the user, create any missling files/db nodes on first login
export async function loginUser(email, auth , db) {

    if (!isValidEmail(email)) {
    console.log(`${color.red('Error:')} Invalid email`);
    process.exit(1);
    }

    var password = question('Enter your password: ', { hideEchoBack: true });

    const s = prompts.spinner();
    s.start('Logging in user...'); // spinner

    signInWithEmailAndPassword(auth, email, password)
    .then(async (userCredential) => {

        // Check if user is verified by email first
        if (!userCredential.user.emailVerified) {
            console.log(`\n${color.red('Error:')} User email not verified`);
            process.exit(1);
        }

        // Save session data to local disk to avoid re-sign in every time the app is started
        
        // Encrypt the email and password using unique machine id
        const sessionJson = {
            email: encryptDataSymmetrical(email, machineIdSync().slice(0, 32)),
            password: encryptDataSymmetrical(password, machineIdSync().slice(0, 32))
        }

        const dataString = JSON.stringify(sessionJson);

        // Define the path to the hidden folder in the user's home directory
        const hiddenFolderPath = path.join(os.homedir(), '.peanuts');

        // Ensure the hidden folder exists, or create it if it doesn't
        if (!fs.existsSync(hiddenFolderPath)) {
            fs.mkdirSync(hiddenFolderPath);
        }

        // Define the path to the authentication token file
        const sessionFilePath = path.join(hiddenFolderPath, 'session.json');

        // Save to the authentication token file
        fs.writeFileSync(sessionFilePath, dataString, 'utf8', { flag: 'w' });

        // check if there is an existing in firebase for this user under /profiles/profileId
        // holding basic user account info

        // first, make the email compatible with firebase
        // replacing all . with _
        const firebase_email = email.replace(/\./g, '_');

        // Get a read once snapshot of the database at that path
        // I prefer the await async syntax of resolving multiple promises to the .then syntax in this case
        // as we don't need the code to be fully async, and we gain the legibility of code without nesting
        
        const db = getDatabase();

        // Get the firebase user reference
        const userRef = ref(db, 'users/' + firebase_email);
        const userRefPrivate = ref(db, 'users/' + firebase_email+'/private');
        // We are using the user's email as parent node instead of UID because we are not using server code
        // and we want other client users to be able to find the public information of this user
        // based on their email (to add them and send peanut texts to them)
        
        const snapshot = await get(userRefPrivate);

        // If it doesn't exist, this is the first time they log in, add the needed data and save them
        if (!snapshot.exists()) 
        {

            // Create the user's encryption keys, no passphrase, 2k mod len should be enough
            // pem export format for easy string read/write
            const { publicKey, privateKey} = 
                crypto.generateKeyPairSync('rsa', {
                    modulusLength: 2048,
                    publicKeyEncoding: {
                    type: 'spki',   // could be pkcs1
                    format: 'pem',
                    },
                    privateKeyEncoding: {
                    type: 'pkcs8',  // could be pkcs1
                    format: 'pem',
                    },
                });   
            
            try {
                // Set user public user data in user node path (uid, email, public key)
                await set(child(userRef,'public'), { 
                    uid: userCredential.user.uid,
                    email: userCredential.user.email,
                    publicKey: publicKey,
                });

                // Private info, secure with security rules
                await set(child(userRef,'private'), { 
                    uid: userCredential.user.uid,
                    privateKey: privateKey,
                });

                // TODO: Figure how/where to add teams in the future when working on this feature
                // await set(child(userRef,'private/teams'), { 
                //     dummy: 'default',
                // });

                console.log(`${color.green('\nSuccess:')} User logged in`);
                s.stop();
                process.exit(0);
                
            } catch (error) {
                console.error(`${color.red('\nError:')} Failed to add user or contact:`, error);
                s.stop();
                process.exit(1);
            } 

        }
        else {
            s.stop();
            console.log(`${color.green('Success:')} User logged in`);
            process.exit(0);
        }          
    })
    .catch((error) => {
        const errorMessage = error.message;
        console.log(`\n${color.red('Login Error:')} ${errorMessage}`);
        s.stop();
        process.exit(1);
    });   
}

// Register new user
export function registerUser(email, auth) {
         
    // Is email valid
    if (!isValidEmail(email)) {
    console.log(`${color.red('Error:')} Invalid email`);
    process.exit(1);
    }

    // Get the password interactively from user input
    // we dont want to pass the password as a parameter as this could cause a security issue
    // in the terminal command history
    var password0 = question('Enter your password: ', { hideEchoBack: true });

    var password = question('Enter your password again: ', { hideEchoBack: true });

    if (password0 != password) {
    console.log(`${color.red('Error:')} Passwords do not match`);
    process.exit(1);
    }

    // make sure password is at least 8 characters long and has at least one number, one uppercase letter, and one lowercase letter, and one special character
    if (password.length < 8) {
    console.log(`${color.red('Error:')} Password must be at least 8 characters long`);
    process.exit(1);
    }

    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    console.log(`${color.red('Error:')} Password must contain at least one number, one uppercase letter, one lowercase letter, and one special character`);
    process.exit(1);
    }

    const s = prompts.spinner()
    s.start('Creating user...')

    // register new user on firebase auth based on provided email and password
    createUserWithEmailAndPassword(auth, email, password).then(() => {
    console.log(`\n${color.green('Success:')} User created`);

    s.start('Sending email...\n')
    // send verification email
    const auth = getAuth(); // get auth instance after registration
    sendEmailVerification(auth.currentUser)
        .then(() => {
        console.log(`\n${color.green('Success:')} Verification email sent`);
        s.stop()
        process.exit(0);
        });

    }).catch((error) => {
    console.error(`\n${color.red('Error creating user: ')} ${error.code}`);
    process.exit(1);
    });
}

// Sign out user
export function logoutUser() {

    // Delete cached session data, on next app start using will be signed out
    
    // Rememeber we currently re-sign in the user on each app invocation so there is  
    // no need to 'sign them off' in the traditional sense, as they get signed off each time
    // the app terminates and there is no custom sdk token used either for login or logout

    const hiddenFolderPath = path.join(os.homedir(), '.peanuts');
    const authFilePath = path.join(hiddenFolderPath, 'session.json');

    // check if cached auth json file exists
    if (fs.existsSync(authFilePath)) {
    
        // delete it
        fs.unlinkSync(authFilePath);
        console.log(`\n${color.green('Success:')} User logged out`);
        process.exit(0);
    }
}

// Reset password, requires the user to be already login
export function resetPassword(user) {

    // Compare new password with old password

    var password_original = question('Enter your current password: ', { hideEchoBack: true });

    const hiddenFolderPath = path.join(os.homedir(), '.peanuts');
    const authFilePath = path.join(hiddenFolderPath, 'session.json');

    if (fs.existsSync(authFilePath)) {
        const sessionData = fs.readFileSync(authFilePath, 'utf8');
    
        const sessionJson = JSON.parse(sessionData);
    
        const password_saved = decryptDataSymmetrical(sessionJson.password, machineIdSync().slice(0, 32));

        if (password_original != password_saved) {
            console.log(`${color.red('Error:')} Incorrect password`);
            process.exit(1);
        }

        // Get new password interactively twice
        var newPassword0 = question('Enter your new password: ', { hideEchoBack: true });

        var newPassword1 = question('Enter your new password again: ', { hideEchoBack: true });

        if (newPassword0 != newPassword1) {
            console.log(`${color.red('Error:')} Passwords do not match`);
            process.exit(1);
        }

        //Check password complexity
        if (!/[a-z]/.test(newPassword0) || !/[A-Z]/.test(newPassword0) || !/[0-9]/.test(newPassword0) || !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword0)) {
            console.log(`${color.red('Error:')} Password must contain at least one number, one uppercase letter, one lowercase letter, and one special character`);
            process.exit(1);
        }

        // Update password
        updatePassword(user, newPassword0).then(() => {

            console.log(`\n${color.green('Success:')} Password updated`);
            console.log('\n Login again with your new password');

            // delete cached auth json file
            fs.unlinkSync(authFilePath);

            process.exit(0);

            
        }).catch((error) => {
            console.error(`\n${color.red('Error updating password: ')} ${error.code}`);
            process.exit(1);
        });

    } else {
        console.log(`${color.red('Error:')} User not logged in`);
        process.exit(1);
    }


}

// Manage users (list/add/remove)
// only users you add manually can send you shared peanut text
export async function manageUsers(user, db) {

    const userEmail = user.email;
    const firebase_email = userEmail.replace(/\./g, '_');
    
    // for the security rules to apply easily (no child nesting)
    // the contacts must all be props with the email as key (. replace by _)
    const contactsRef = ref(db, `users/${firebase_email}/private/contacts`);

    let snapshot = await get(contactsRef);

    try {
        let promptList = [];
        if (snapshot.exists()) {

            // Load all the propertie keys under snapshot into an array
            // Convert snapshot key name into an array of values
            const propArray = Object.keys(snapshot.val());
            
            propArray.forEach((prop) => {
                promptList.push({ label: prop.replace(/\_/g, '.'), value: "DAT:" + prop });
            })
            // sort promptList alphabetically
            promptList.sort((a, b) => a.label.localeCompare(b.label));
        }
        
        promptList.push({ label: `${color.cyan('Add')}`, value: "ADD:USER" });
        promptList.push({ label: `${color.yellow('Cancel')}`, value: "CNL:USER" });

        let answer_user = await prompts.select({
            message: 'Select a User',
            options: promptList
        });

        if (answer_user == "CNL:USER") {
            console.log(`\n${color.green('Success:')} Cancelled`);
            process.exit(0);
        }
        // add option was selected
        else if (answer_user == "ADD:USER") {
            console.log(`\n${color.green('Success:')} Add new user`);

            let user = question(color.cyan("Add user's email:\n"));

            if (!isValidEmail(user)) {
                console.log(`${color.red('Error:')} Invalid email`);
                process.exit(1);
            }   
            // add user as a prop to the contacts ref
            else {

                // make the email firebase compatibly
                user = user.replace(/\./g, '_');

                await update(contactsRef, {
                    [user]: "true"
                });

                console.log(`\n${color.green('Success:')} User added`);
                process.exit(0);
            }
        }
        // a user was selected
        else {
            // remove prefix and get action
            answer_user = answer_user.slice(4);

            let answer_action = await prompts.select({
                message: 'Action',
                options: [ 
                            {value: 'cancel' , label: 'Cancel'},
                            {value: 'delete' , label: color.red('# Delete #')}
                            ]
                });

            if (answer_action == 'cancel') {

                console.log(`\n Action Canceled`);
                process.exit(0);

            } else if (answer_action == 'delete') {

                // remove the property from the contacts ref
                await update(contactsRef, {
                    [answer_user]: null
                })

                console.log(`\n${color.green('Success:')} User deleted`);
                process.exit(0);
            }

        }
        process.exit(0);
        
    } catch(error) {
        console.error(`\n${color.red('Error Loading Contacts:')} ${error.code}`);
        process.exit(1);
    }
}