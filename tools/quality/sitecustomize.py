"""Use bundled Tree-sitter grammars with tools expecting the newer download API."""

try:
    import tree_sitter_language_pack
except ImportError:
    pass
else:
    if not hasattr(tree_sitter_language_pack, "download"):
        def download_bundled_grammars(_languages):
            return None

        tree_sitter_language_pack.download = download_bundled_grammars
