pub use goose_providers::canonical::catalog::{
    ModelCapabilities, ModelTemplate, ProviderCatalogEntry, ProviderFormat,
    ProviderSetupCapabilities, ProviderSetupCatalogEntry, ProviderSetupCategory,
    ProviderSetupField, ProviderSetupFieldOverride, ProviderSetupGroup, ProviderSetupMetadata,
    ProviderSetupMethod, ProviderTemplate,
};
use std::collections::HashSet;

pub async fn get_providers_by_format(format: ProviderFormat) -> Vec<ProviderCatalogEntry> {
    let native_provider_ids = super::init::providers()
        .await
        .into_iter()
        .map(|(metadata, _)| metadata.name)
        .collect::<HashSet<_>>();

    goose_providers::canonical::catalog::get_providers_by_format(format, &native_provider_ids)
}

pub async fn get_setup_catalog_entries() -> Vec<ProviderSetupCatalogEntry> {
    goose_providers::canonical::catalog::get_setup_catalog_entries(
        super::providers()
            .await
            .into_iter()
            .map(|(metadata, _)| metadata),
    )
}

pub fn get_provider_template(provider_id: &str) -> Option<ProviderTemplate> {
    goose_providers::canonical::catalog::get_provider_template(provider_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Каталог upstream описывал два десятка провайдеров; в Василисе зарегистрирован
    // единственный, поэтому проверяем именно это: свой провайдер в каталоге есть,
    // чужих нет.
    #[tokio::test]
    async fn setup_catalog_contains_only_the_inference_service() {
        let entries = get_setup_catalog_entries().await;
        let provider_ids: Vec<&str> = entries
            .iter()
            .map(|entry| entry.provider_id.as_str())
            .collect();

        assert!(
            provider_ids.contains(&"openai"),
            "каталог должен содержать сервис инференса, получено: {provider_ids:?}"
        );
        for foreign in ["anthropic", "groq", "zai", "ollama", "claude-code"] {
            assert!(
                !provider_ids.contains(&foreign),
                "провайдер {foreign} не должен попадать в каталог"
            );
        }
    }

    #[tokio::test]
    async fn registry_exposes_a_single_provider() {
        let providers = crate::providers::providers().await;
        let names: Vec<String> = providers
            .into_iter()
            .map(|(metadata, _)| metadata.name)
            .collect();
        assert_eq!(names, vec!["openai".to_string()]);
    }
}
