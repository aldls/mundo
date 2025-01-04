const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');

const app = express();

// Use session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

// Initialize passport
app.use(passport.initialize());
app.use(passport.session());

// Body parser middleware to handle form submissions
app.use(express.urlencoded({ extended: true }));

// Define the user schema
const userSchema = new mongoose.Schema({
  googleId: { type: String, required: true },
  displayName: { type: String },
  email: { type: String },
  photo: { type: String },
  nickname: { type: String, unique: true, required: false },
  level: { type: Number, default: 1 }
});

const User = mongoose.model('User', userSchema); // Use User model


//----------------------------------------------------------------------------------------------------  
// Google OAuth Strategy to authenticate the user
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: 'http://localhost:3000/auth/google/callback'
},
async function(token, tokenSecret, profile, done) {
  try {
    let user = await User.findOne({ googleId: profile.id });

    if (user) {
      // If the user exists, check if nickname is set
      if (!user.nickname || user.nickname.trim() === '') {
        // Assign default nickname if it is empty or null
        user.nickname = `user-${profile.id}`;
        await user.save();
      }
      return done(null, user); // Continue with the login process
    } else {
      // Create a new user if not found
      user = new User({
        googleId: profile.id,
        displayName: profile.displayName,
        email: profile.emails[0].value,
        photo: profile.photos[0].value,
        nickname: `user-${profile.id}` // Set a default nickname initially
      });

      await user.save();  // Save the new user to the database
      return done(null, user); // Pass the new user to the next middleware
    }
  } catch (err) {
    console.error('Google Strategy Error:', err);
    done(err);
  }
}));

//----------------------------------------------------------------------------------------------------  


//----------------------------------------------------------------------------------------------------  
// Serialize user info into the session
passport.serializeUser((user, done) => {
  done(null, user);
});

// Deserialize user info from the session
passport.deserializeUser((id, done) => {
  User.findById(id)
    .then(user => done(null, user))
    .catch(err => done(err));
});
//----------------------------------------------------------------------------------------------------  

app.get('/', (req, res) => {
  if (req.isAuthenticated()) {
    if (req.user.nickname && req.user.nickname.startsWith('user-')) {
      // Redirect to nickname change page if the user has the default nickname
      res.redirect('/set-nickname');
    } else {
      res.send(`
        <h1>Welcome to the Summoner's Rift, ${req.user.nickname}!</h1>
          <form action="/set-nickname" method="POST">
          <label for="nickname">Enter your nickname:</label>
          <input type="text" name="nickname" required />
          <button type="submit">Submit</button>
        </form>
        <a href="/logout">Logout</a>
      `);
    }
  } else {
    res.sendFile(path.join(__dirname, '../Client/public', 'login.html'));
  }
});


const publicPath = path.join(__dirname, '..', 'Client', 'public');
console.log('Serving static files from:', publicPath);
app.use(express.static(publicPath));

// Route to start the Google OAuth flow
app.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// Route to handle the Google OAuth callback
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    // If the user has the default nickname, redirect to set-nickname page
    if (req.user.nickname.startsWith('user-')) {
      return res.redirect('/set-nickname');
    }
    res.redirect('/loading'); // Otherwise, first move on to the loading page
  }
);


// Route to handle the loading screen
app.get('/loading', (req, res) => {
  if (req.isAuthenticated()) {
    res.sendFile(path.join(publicPath, 'loading.html'));
  } else {
    res.redirect('/set-nickname'); // Redirect to login if not authenticated
  }
});

//----------------------------------------------------------------------------------------------------
// Route to handle setting the nickname
app.get('/set-nickname', (req, res) => {
  if (req.isAuthenticated()) {
    if (req.user.nickname.startsWith('user-')) {
      // Display the form to set a permanent nickname
      res.send(`
        <h1>Set Your Nickname</h1>
        <form action="/set-nickname" method="POST">
          <label for="nickname">Enter your permanent nickname:</label>
          <input type="text" name="nickname" required />
          <button type="submit">Submit</button>
        </form>
      `);
    } else {
      res.redirect('/dashboard'); // Redirect to home if the nickname is already set
    }
  } else {
    res.redirect('/dashboard'); // Redirect to login if not authenticated
  }
});

//----------------------------------------------------------------------------------------------------
// Game URL to redirect the user after login
const gameUrl = 'http://localhost:2567/01-chat.html'; // Replace with the actual game URL


//----------------------------------------------------------------------------------------------------
// Route to handle the dashboard
app.get('/dashboard', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/'); // Redirect to login if not authenticated
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).send('User not found');
    }

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>User Dashboard</title>
        <link rel="stylesheet" href="styles.css"> <!-- Assuming you have the CSS file -->
      </head>
      <body>
        <div class="container">
          <!-- Left Side -->
          <div class="left-side">
            <h1>Welcome to the Dashboard, ${user.nickname}!</h1>
            <button onclick="window.location.href='/set-nickname'">Set Nickname</button>
            <button onclick="window.location.href='/logout'">Logout</button>
          </div>

          <!-- Right Side -->
          <div class="right-side">
            <h2>User Profile</h2>
            <img src="${user.photo}" alt="Profile Picture" class="profile-photo" />
            <p><strong>Nickname:</strong> ${user.nickname || 'Not set'}</p>
            <p><strong>Level:</strong> ${user.level}</p>
            <button onclick="window.location.href='/edit-profile'">Edit Profile</button>
            <br><br>
            <button onclick="window.location.href='${gameUrl}'">Play Game</button>
            <br><br>
            <form action="/delete-account" method="POST" onsubmit="return confirm('Are you sure you want to delete your account? This action is irreversible.')">
              <button type="submit" style="color: red;">Delete Account</button>
            </form>
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error(err);
    res.status(500).send('Error retrieving user data');
  }
});




//----------------------------------------------------------------------------------------------------
// MongoDB connection
mongoose.connect('mongodb://localhost:27017/mydb')
  .then(() => {
    console.log('MongoDB connected');
  })
  .catch((err) => {
    console.log('MongoDB connection error:', err);
  });



//----------------------------------------------------------------------------------------------------  
// Route to handle nickname submission
// Route to handle nickname submission
app.post('/set-nickname', async (req, res) => {
  const { nickname } = req.body;

  // Ensure the nickname is not empty
  if (!nickname || nickname.trim() === '' || nickname.length < 3 || nickname.length > 20) {
    return res.send(`
      <h1>Nickname must be between 3 and 20 characters.</h1>
      <form action="/set-nickname" method="POST">
        <label for="nickname">Enter your permanent nickname:</label>
        <input type="text" name="nickname" required />
        <button type="submit">Submit</button>
      </form>
      <a href="/">Cancel</a>
    `);
  }
  

  if (req.user) {
    try {
      // Check if the nickname is already taken
      const existingUser = await User.findOne({ nickname });
      if (existingUser && existingUser._id.toString() !== req.user._id.toString()) {
        return res.send(`
          <h1>Oops! The nickname "${nickname}" is already taken. Please choose a different one.</h1>
          <form action="/set-nickname" method="POST">
            <label for="nickname">Enter a new nickname:</label>
            <input type="text" name="nickname" required />
            <button type="submit">Submit</button>
          </form>
          <a href="/">Cancel</a>
        `);
      }

      // Set the nickname
      req.user.nickname = nickname;
      await req.user.save();

      res.send(`
        <h1>Welcome to the Summoner's Rift, ${req.user.nickname}!</h1>
        <a href="/logout">Logout</a>
        <a href="/loading">Go To Main Page</a>
      `);
    } catch (err) {
      console.error(err);
      res.status(500).send('Error saving nickname');
    }
  } else {
    res.status(401).send('User not authenticated');
  }
});


//----------------------------------------------------------------------------------------------------
// Logout route
app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error('Error during logout:', err);
      return res.status(500).send('Error logging out');
    }
    // Clear the session and redirect to Google's logout URL
    req.session.destroy(() => {
      res.redirect(`https://accounts.google.com/logout?continue=https://appengine.google.com/_ah/logout?continue=${encodeURIComponent('http://localhost:3000')}`);
    });
  });
});
//----------------------------------------------------------------------------------------------------


//delete account route
app.post('/delete-account', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/'); // Redirect back to login if not authenticated
  }

  try {
    // Remove the user from the database
    await User.findByIdAndDelete(req.user._id);

    // Log the user out
    req.logout((err) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Error logging out');
      }
      res.redirect('/'); // Redirect to the home page after deletion
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error deleting account');
  }
});


// Start the server
app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
