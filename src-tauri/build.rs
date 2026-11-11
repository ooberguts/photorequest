fn main() {
    for name in ["PHOTOREQUEST_GIT_SHA", "PHOTOREQUEST_BUILD_NUMBER"] {
        println!("cargo:rerun-if-env-changed={name}");
        let value = std::env::var(name).unwrap_or_else(|_| "development".into());
        println!("cargo:rustc-env={name}={value}");
    }
    tauri_build::build()
}
