const express = require('express');
const QRCode = require('qrcode');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const { exec } = require('child_process');
const archiver = require('archiver');

const app = express();
const PORT = 3000;

// Middleware to parse JSON and serve static files
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Ensure uploads directory exists
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Route to serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Route to serve the compress page
app.get('/compress', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'compress.html'));
});

// Route to generate QR code
app.post('/generate-qr', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL é obrigatória' });
  }

  try {
    // Generate QR code as data URL
    const qrCodeDataURL = await QRCode.toDataURL(url);
    res.json({ qrCode: qrCodeDataURL });
  } catch (error) {
    res.status(500).json({ error: 'Falha ao gerar QR code' });
  }
});

// Route to compress PDFs
app.post('/compress-pdf', upload.array('pdfs'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Nenhum arquivo PDF enviado' });
  }

  const compressedFiles = [];
  let processed = 0;

  req.files.forEach((file, index) => {
    const inputPath = file.path;
    const baseName = path.parse(file.originalname).name;
    const ext = path.parse(file.originalname).ext;
    const outputPath = path.join('uploads', `${baseName}_comp${ext}`);
    
    // Ghostscript command for compression
    const gsCommand = `"C:\\Program Files\\gs\\gs10.05.1\\bin\\gswin64c.exe" -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`;
    
    exec(gsCommand, (error, stdout, stderr) => {
      processed++;
      
      if (error) {
        console.error(`Error compressing ${file.originalname}:`, error);
        // Clean up
        fs.unlinkSync(inputPath);
      } else {
        compressedFiles.push({
          originalName: file.originalname,
          compressedName: `${baseName}_comp${ext}`,
          path: outputPath
        });
        // Clean up original
        fs.unlinkSync(inputPath);
      }
      
      // When all files are processed, create ZIP
      if (processed === req.files.length) {
        if (compressedFiles.length === 0) {
          return res.status(500).json({ error: 'Falha ao comprimir PDFs. Certifique-se de que o Ghostscript está instalado.' });
        }
        
        const zipName = `pdfs_comp_${Date.now()}.zip`;
        const zipPath = path.join('uploads', zipName);
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        
        output.on('close', () => {
          // Clean up compressed files
          compressedFiles.forEach(f => fs.unlinkSync(f.path));
          
          res.json({ 
            zipFile: zipName,
            downloadUrl: `/download/${encodeURIComponent(zipName)}`,
            fileCount: compressedFiles.length
          });
        });
        
        archive.on('error', (err) => {
          throw err;
        });
        
        archive.pipe(output);
        
        compressedFiles.forEach(f => {
          archive.file(f.path, { name: f.compressedName });
        });
        
        archive.finalize();
      }
    });
  });
});

// Route to download compressed files
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join('uploads', filename);
  
  if (fs.existsSync(filePath)) {
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
      } else {
        // Clean up file after download
        fs.unlinkSync(filePath);
      }
    });
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
