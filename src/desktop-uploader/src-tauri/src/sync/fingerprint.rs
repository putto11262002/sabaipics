use std::{
    fmt,
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
};

const SMALL_FILE_THRESHOLD: u64 = 128 * 1024;
const CHUNK_SIZE: usize = 64 * 1024;

#[derive(Debug)]
pub enum FingerprintError {
    Open(std::io::Error),
    Metadata(std::io::Error),
    Read(std::io::Error),
    Seek(std::io::Error),
}

impl fmt::Display for FingerprintError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Open(e) => write!(f, "open: {e}"),
            Self::Metadata(e) => write!(f, "metadata: {e}"),
            Self::Read(e) => write!(f, "read: {e}"),
            Self::Seek(e) => write!(f, "seek: {e}"),
        }
    }
}

/// Fast content fingerprint for client-side dedup.
///
/// - Always includes file size in the hash.
/// - Small files (<=128KB): hash entire content.
/// - Large files: hash first 64KB + last 64KB.
pub fn fingerprint(path: &Path) -> Result<String, FingerprintError> {
    let mut file = File::open(path).map_err(FingerprintError::Open)?;
    let size = file.metadata().map_err(FingerprintError::Metadata)?.len();

    let mut hasher = blake3::Hasher::new();
    hasher.update(&size.to_le_bytes());

    if size <= SMALL_FILE_THRESHOLD {
        let mut buf = [0u8; 32 * 1024];
        loop {
            let n = file.read(&mut buf).map_err(FingerprintError::Read)?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
        }
    } else {
        let mut chunk = [0u8; CHUNK_SIZE];

        file.seek(SeekFrom::Start(0))
            .map_err(FingerprintError::Seek)?;
        file.read_exact(&mut chunk)
            .map_err(FingerprintError::Read)?;
        hasher.update(&chunk);

        file.seek(SeekFrom::End(-(CHUNK_SIZE as i64)))
            .map_err(FingerprintError::Seek)?;
        file.read_exact(&mut chunk)
            .map_err(FingerprintError::Read)?;
        hasher.update(&chunk);
    }

    Ok(hasher.finalize().to_hex().to_string())
}
