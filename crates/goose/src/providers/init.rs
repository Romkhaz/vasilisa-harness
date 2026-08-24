use std::path::PathBuf;
use std::sync::{Arc, RwLock};

use super::{
    base::{Provider, ProviderMetadata},
    provider_registry::ProviderRegistry,
};
use crate::config::ExtensionConfig;
use crate::providers::base::ProviderType;
use crate::providers::openai_def::OpenAiProviderDef;
use crate::providers::provider_registry::ProviderEntry;
use anyhow::Result;
use tokio::sync::OnceCell;

static REGISTRY: OnceCell<RwLock<ProviderRegistry>> = OnceCell::const_new();

/// Агент Василиса ходит к модели только через OpenAI-совместимый endpoint:
/// пользователь вводит выданный ему ключ и адрес для инференса. Остальные провайдеры
/// upstream'а (Anthropic, Bedrock, Ollama, ACP-агенты и прочие) намеренно не
/// регистрируются, поэтому их не видно ни в `_goose/unstable/providers/list`, ни в
/// интерфейсе — формы настройки строятся из метаданных реестра.
async fn init_registry() -> RwLock<ProviderRegistry> {
    let tls_config =
        crate::config::tls::provider_tls_config_from_config(crate::config::Config::global())
            .expect("failed to load provider TLS config");
    let registry = ProviderRegistry::new(tls_config).with_providers(|registry| {
        use super::inventory::registrations;

        registry.register_with_inventory::<OpenAiProviderDef>(
            true,
            Some(registrations::openai_inventory()),
        );
    });
    RwLock::new(registry)
}

/// Декларативные провайдеры (встроенные JSON-описания и пользовательские файлы в
/// `custom_providers/`) отключены: единственный доступный способ подключения — тот, что
/// зарегистрирован в [`init_registry`]. Функция оставлена, чтобы публичный
/// [`refresh_custom_providers`] сохранял свою сигнатуру.
fn load_custom_providers_into_registry(_registry: &mut ProviderRegistry) -> Result<()> {
    Ok(())
}
async fn get_registry() -> &'static RwLock<ProviderRegistry> {
    REGISTRY.get_or_init(init_registry).await
}

pub async fn providers() -> Vec<(ProviderMetadata, ProviderType)> {
    get_registry()
        .await
        .read()
        .unwrap()
        .all_metadata_with_types()
}

pub async fn refresh_custom_providers() -> Result<()> {
    let registry = get_registry().await;
    registry.write().unwrap().remove_custom_providers();

    if let Err(e) = load_custom_providers_into_registry(&mut registry.write().unwrap()) {
        tracing::warn!("Failed to refresh custom providers: {}", e);
        return Err(e);
    }

    tracing::info!("Custom providers refreshed");
    Ok(())
}

pub async fn get_from_registry(name: &str) -> Result<ProviderEntry> {
    let guard = get_registry().await.read().unwrap();
    guard
        .entries
        .get(name)
        .ok_or_else(|| anyhow::anyhow!("Unknown provider: {}", name))
        .cloned()
}

pub async fn inventory_identity(name: &str) -> Result<super::inventory::InventoryIdentityInput> {
    get_from_registry(name).await?.inventory_identity()
}

pub async fn create(name: &str, extensions: Vec<ExtensionConfig>) -> Result<Arc<dyn Provider>> {
    let entry = get_from_registry(name).await?;
    entry.create(extensions).await
}

pub async fn create_with_working_dir(
    name: &str,
    extensions: Vec<ExtensionConfig>,
    working_dir: PathBuf,
) -> Result<Arc<dyn Provider>> {
    let entry = get_from_registry(name).await?;
    entry.create_with_working_dir(extensions, working_dir).await
}

pub async fn create_with_default_model(
    name: impl AsRef<str>,
    extensions: Vec<ExtensionConfig>,
) -> Result<Arc<dyn Provider>> {
    get_from_registry(name.as_ref())
        .await?
        .create_with_default_model(extensions)
        .await
}

pub async fn cleanup_provider(name: &str) -> Result<()> {
    let cleanup_fn = {
        let registry = get_registry().await.read().unwrap();
        registry
            .entries
            .get(name)
            .and_then(|entry| entry.cleanup.clone())
    };
    if let Some(cleanup) = cleanup_fn {
        return cleanup().await;
    }
    Ok(())
}

pub async fn create_with_named_model(
    provider_name: &str,
    extensions: Vec<ExtensionConfig>,
) -> Result<Arc<dyn Provider>> {
    create(provider_name, extensions).await
}


#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_only_openai_provider_is_registered() {
        let providers_list = providers().await;
        let names: Vec<&str> = providers_list.iter().map(|(m, _)| m.name.as_str()).collect();
        assert_eq!(
            names,
            vec!["openai"],
            "Василиса должна предлагать единственный OpenAI-совместимый провайдер"
        );
    }

    #[tokio::test]
    async fn test_openai_exposes_only_key_and_base_url() {
        let entry = get_from_registry("openai")
            .await
            .expect("openai provider should be registered");
        let meta = entry.metadata();
        let keys: Vec<&str> = meta.config_keys.iter().map(|k| k.name.as_str()).collect();
        assert_eq!(
            keys,
            vec!["OPENAI_API_KEY", "OPENAI_BASE_URL"],
            "пользователь вводит только ключ и адрес для инференса"
        );
        assert!(meta.config_keys[0].secret, "ключ должен храниться как секрет");
        assert!(meta.config_keys[0].required, "ключ обязателен");
        assert!(meta.config_keys[1].required, "адрес обязателен");
    }

    #[tokio::test]
    async fn test_openai_supports_inventory_refresh() {
        let entry = get_from_registry("openai")
            .await
            .expect("openai provider should be registered");
        assert!(
            entry.supports_inventory_refresh(),
            "список моделей должен подтягиваться с самого endpoint через fetch_supported_models"
        );
    }
}
