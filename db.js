"use strict";
const firebase = require('firebase');
const config = require('./config');

const db = firebase.intializeApp(config.firebaseConfig);

module.exports = db;
