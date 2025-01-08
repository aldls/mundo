const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const mongoose = require('mongoose');

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

console.log('GOOGLE_CLIENT_ID:', process.env.GOOGLE_CLIENT_ID);
console.log('GOOGLE_CLIENT_SECRET:', process.env.GOOGLE_CLIENT_SECRET);

const { pbkdf2 } = require('crypto');
const app = express();
// Serve static files from the 'Client/public' directory
app.use(express.static('Client/public'));

// Use EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views', 'pages')); // Set views path to 'views/pages'

// Middleware to parse JSON requests
app.use(express.json());



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
  wins: { type: Number, default: 0 },  // Track number of wins
  losses: { type: Number, default: 0 },  // Track number of losses
});


const User = mongoose.model('User', userSchema); // Use User model


// Define the schema for the battle records
const battleRecordSchema = new mongoose.Schema({
  player1: { type: String, required: true },
  player2: { type: String, required: true },
  winner: { type: String, required: true }  
});

const BattleRecord = mongoose.model('battleRecord', battleRecordSchema);;


module.exports = BattleRecord;

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
    res.redirect('login.html');
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
      // Pass dynamic data (like errors or user info) to the EJS template
      res.render('nickname', { error: '' });
    } else {
      res.redirect('/loading'); // Redirect to home if the nickname is already set
    }
  } else {
    res.redirect('/'); // Redirect to login if not authenticated
  }
});

//----------------------------------------------------------------------------------------------------
 

//----------------------------------------------------------------------------------------------------
// Route to handle the dashboard
app.get('/dashboard', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/'); // Redirect to login if not authenticated
  }


  // Now get the nickname from the authenticated user
  const nickname = req.user.nickname;
  // Game URL to redirect the user after login
  const gameServerUrl = 'https://mundo-420250837972.asia-northeast3.run.app/07-custom-lobby-room.html'; // Replace with the actual game URL
  const gameUrl = `${gameServerUrl}?nickname=${encodeURIComponent(nickname)}`;
  // Render the dashboard EJS template and pass the user data
  res.render('dashboard', { user: req.user, gameUrl });
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

// This will be an API endpoint to get the user's nickname
app.get('/api/user/nickname', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  // Send user data (nickname in this case) as JSON
  res.json({ nickname: req.user.nickname });
});




//----------------------------------------------------------------------------------------------------
// MongoDB connection
mongoose.connect("mongodb+srv://huitaehanww:hhan@hhan.ytv2q.mongodb.net/mydb?retryWrites=true&w=majority&appName=hhan")
  .then(() => {
    console.log('MongoDB connected');
  })
  .catch((err) => {
    console.log('MongoDB connection error:', err);
  });

// mongoose.connect('mongodb://host.docker.internal:27017/mydb', {
//   useNewUrlParser: true,
//   useUnifiedTopology: true
// });

// mongoose.connect('mongodb://mongodb:27017/mydb', {
//   useNewUrlParser: true,
//   useUnifiedTopology: true
// });

  


//----------------------------------------------------------------------------------------------------  
// Route to handle nickname submission
app.post('/set-nickname', async (req, res) => {
  const { nickname } = req.body;

  // Ensure the nickname is not empty
  if (!nickname || nickname.trim() === '' || nickname.length < 3 || nickname.length > 20) {
    return res.render('nickname', {
      error: "Nickname must be between 3 and 20 characters."
    });
  }

  if (req.user) {
    try {
      // Check if the nickname is already taken
      const existingUser = await User.findOne({ nickname });
      if (existingUser && existingUser._id.toString() !== req.user._id.toString()) {
        return res.render('nickname', {
          error: `이런! "${nickname}" 은/는 이미 사용중입니다. 다른 닉네임을 입력해주세요.`
        });
      }

      // Set the nickname
      req.user.nickname = nickname;
      await req.user.save();
      res.redirect('/loading');
    } catch (err) {
      console.error(err);
      res.status(500).send('Error saving nickname');
    }
  } else {
    res.status(401).send('User not authenticated');
  }
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


//----------------------------------------------------------------------------------------------------
// Endpoint to receive battle records
app.post('/battleRecords', async (req, res) => {
  const record = req.body;
  console.log(req.body);
  // Validate the structure of each battle record
  if (!record.player1 || !record.player2  || !record.winner) {
    return res.status(400).json({ message: 'Missing required fields in battle record' });
  }

  try {
    // Iterate over each battle record and update the player's wins or losses
    const p1 = await User.findOne({ nickname: record.player1 });
    const p2 = await User.findOne({ nickname: record.player2})

    if (!p1) {
      return res.status(404).json({ message: `Player with nickname ${record.player1} not found` });
    }
    if (!p2) {
      return res.status(404).json({ message: `Player with nickname ${record.player2} not found` });
    }
    // Update the win or loss count
    if (record.winner === record.player1 ) {
      p1.wins += 1;  // Increment wins if the player won
      p2.losses += 1;  
    } else {
      p1.losses += 1;  // Increment losses if the player lost
      p2.wins += 1;
    }

    // Save updated player info
    await p1.save();
    await p2.save();
    

    res.status(200).json({ message: 'Battle records received and saved successfully' });
  } catch (error) {
    console.error('Error saving battle records:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


app.get('/leaderboard', async (req, res) => {
  try {
    // Extract sort field and order from query parameters (default to sorting by wins in descending order)
    const sortBy = req.query.sortBy || 'wins';  // Default sort by wins
    const order = req.query.order === 'desc' ? -1 : 1;  // Default to ascending (1) or descending (-1)

    let sortedData;

    // Sorting based on the provided field and order
    if (sortBy === 'winrate') {
      // To sort by winrate, we'll need to sort by wins and losses in combination
      sortedData = await User.find({})
        .sort({ winrate: order}); // This sorts primarily by wins and secondarily by losses
    } else if (sortBy === 'nickname') {
      sortedData = await User.find({}).sort({ nickname: order });
    } else {
      // Sort by wins or losses
      sortedData = await User.find({}).sort({ [sortBy]: order });
    }

    // Render the leaderboard with the sorted data
    res.render('leaderboard', { players: sortedData });
  } catch (error) {
    console.error('Error fetching leaderboard data:', error);
    res.status(500).send('Error fetching leaderboard data');
  }
});





// Start the server
app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});
