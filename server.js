const express = require('express');
const request = require('request');
const cors = require('cors');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sgMail = require('@sendgrid/mail')

require('dotenv').config();
const auth0ClientId = process.env.AUTH_CLIENT_ID;
const auth0ClientSecret = process.env.CLIENT_SECRET;


const app = express();

const { insertProject, updateProject, insertAboutImage, getUsers, getProjects, getAbout, deleteProject, deleteAboutImage, getProjectById, getAboutById } = require('./src/database/db')

app.use(cors());

app.use('/images', express.static('./src/Images'));
app.use(express.json());

sgMail.setApiKey(process.env.SENDGRID_API_KEY)

app.post('/email', (req, res) => {

  res.header("Access-Control-Allow-Credentials", true);


  const { name, email, message } = req.body;

  const msg = {
    to: 'wayouthereblog@gmail.com',
    from: 'casey.ferrara@outlook.com',
    subject: `New message from ${name}`,
    text: `${message} ${email}`,
    html: `<strong>${message}</strong>`
  }
  sgMail
    .send(msg)
    .then(() => {
      console.log('Email sent')
    })
    .catch((error) => {
      console.error(error)
    })
})

async function isAllowedEmail(email) {
  try {
    const users = await getUsers(); // call the getUsers function and wait for the response
    const emails = users.map(user => user.email); // map the users array to get only the email property
    return emails.includes(email); // check if the email passed as argument is included in the emails array
  } catch (error) {
    console.error(error);
    return false;
  }
}

app.get('/callback', (req, res) => {
  const code = req.query.code;
  const clientId = auth0ClientId;
  const clientSecret = auth0ClientSecret;
  const redirectUri = 'https://secret-beyond-29351.herokuapp.com/callback';

  // Exchange the authorization code for an access token
  request.post({
    url: 'https://dev-apyiutdwrm7rajdb.us.auth0.com/oauth/token',
    form: {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      redirect_uri: redirectUri,
    },
    json: true
  }, (err, response, body) => {
    if (err) {
      res.status(500).send(err);
      return;
    }

    const accessToken = body.access_token;

    // Use the access token to retrieve the user's email address
    request.get({
      url: 'https://dev-apyiutdwrm7rajdb.us.auth0.com/userinfo',
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      json: true
    }, (err, response, body) => {
      if (err) {
        res.status(500).send(err);
        return;
      }
      const email = body.email;
      const name = body.name;
      req.user = { email: email, name: name };
      const expiresIn = '1h';
      const secret = crypto.randomBytes(64).toString('hex');
      const token = jwt.sign({ email: req.user.email, name: req.user.name }, secret, { expiresIn });

      if (req.user && isAllowedEmail(req.user.email)) {
          res.redirect(`https://jbportfolio.vercel.app/admin?token=${token}`);
        } else {
          res.redirect(`https://jbportfolio.vercel.app/admin`);
          res.status(401).send('You are not authorized to access this page');
        }
    });
  });
});

const multer = require('multer');

const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, './src/Images');
  },
  filename: function(req, file, cb) {
    let field;
    if (req.body.type === 'project') {
      field = req.body.projectTitle;
    } else if (req.body.type === 'about') {
      field = req.body.imageTitle;
    }
    cb(null, `${field}`);
  }
});

const upload = multer({ storage: storage });

app.get('/projects', async (req, res) => {
  try {
    const projects = await getProjects();
    res.json(projects);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get('/project/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const projects = await getProjectById(id);
    res.json(projects);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get('/users', async (req, res) => {
  try {
    const users = await getUsers();
    res.json(users);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get('/about', async (req, res) => {
  try {
    const about = await getAbout();
    res.json(about);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.post('/admin/projects/submit', upload.single('image'), async (req, res) => {
  const { projectTitle, projectCategory, projectDescription } = req.body;
  const projectImage = req.file;

  // Use Multer to handle the image upload
  const uploadedImagePath = projectImage.path;

  // Read the binary data of the uploaded image
  const imageData = fs.readFileSync(uploadedImagePath);

  // Write the binary data to a new jpg file
  fs.writeFile(`./src/Images/${projectTitle}.jpg`, imageData, 'binary', (err) => {
    if (err) {
      console.error(err);
      res.sendStatus(500);
      return;
    }

    // Insert the project into the database with the path to the new jpg file
    const project = insertProject(projectTitle, projectCategory, projectDescription, `${projectTitle}.jpg`);
    res.json(project);
  });
});

app.post('/admin/project/update/:id', async (req, res) => {
  const { id } = req.params;
  const oldProject = await getProjectById(id);
  const oldProjectTitle = oldProject.title;
  const { projectTitle, projectCategory, projectDescription } = req.body;

  fs.rename(`./src/Images/${oldProjectTitle}.jpg`, `./src/Images/${projectTitle}.jpg`, (err) => {
    if (err) {
      console.error(err);
      res.sendStatus(500);
      return;
    }
  });

  fs.rename(`./src/Images/${oldProjectTitle}`, `./src/Images/${projectTitle}`, (err) => {
    if (err) {
      console.error(err);
      res.sendStatus(500);
      return;
    }
  });

  try {
    const project = await updateProject(id, projectTitle, projectCategory, projectDescription);
    res.json(project);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});


app.post('/admin/about/submit', upload.single('image'), async (req, res) => {
  
  const { imageTitle } = req.body;
  const aboutImage = req.file;

  // Use Multer to handle the image upload
  const aboutImagePath = aboutImage.path;

  // Read the binary data of the uploaded image
  const aboutImageData = fs.readFileSync(aboutImagePath);

  // Write the binary data to a new jpg file
  fs.writeFile(`./src/Images/${imageTitle}.jpg`, aboutImageData, 'binary', (err) => {
    if (err) {
      console.error(err);
      res.sendStatus(500);
      return;
    }
    
    const about = insertAboutImage(imageTitle, `${imageTitle}.jpg`);
    res.json(about);
  });
});

app.get('/admin/projects', async (req, res) => {
  try {
    const projects = await getProjects();
    res.json(projects);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get('/admin/about', async (req, res) => {
  try {
    const about = await getAbout();
    res.json(about);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.delete('/admin/projects/:id', async (req, res) => {
  try {
    const id = req.params.id;
    // Retrieve the project with the given id
    const project = await getProjectById(id);

    // Extract the project title from the project
    const { title } = project;

    // Delete the image file with the same title as the project
    fs.unlinkSync(`./src/Images/${title}.jpg`);
    fs.unlinkSync(`./src/Images/${title}`);

    await deleteProject(id);

    res.sendStatus(200);

  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.delete('/admin/about/:id', async (req, res) => {
  try {

    const id = req.params.id;
    // Retrieve the project with the given id
    const about = await getAboutById(id);

    const { title } = about;

    // Delete the image file with the same title as the iamge title
    fs.unlinkSync(`./src/Images/${title}.jpg`);
    fs.unlinkSync(`./src/Images/${title}`);

    res.sendStatus(200);

    await deleteAboutImage(id);

  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});


const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Server listening on port ${port}`));