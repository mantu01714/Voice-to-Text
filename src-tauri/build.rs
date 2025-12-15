fn main() {
    // Skip Windows resource generation to avoid icon requirements
    #[cfg(not(windows))]
    tauri_build::build();
    
    #[cfg(windows)]
    {
        // Build without Windows resources on Windows
        println!("cargo:rustc-link-arg=/SUBSYSTEM:WINDOWS");
        println!("cargo:rustc-link-arg=/ENTRY:mainCRTStartup");
    }
}