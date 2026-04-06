from src.connectors.base import BaseConnector
from src.connectors.generic_rest import GenericRESTConnector
from src.connectors.langmem import LangMemConnector
from src.connectors.letta import LettaConnector
from src.connectors.mem0 import Mem0Connector
from src.connectors.zep import ZepConnector

CONNECTOR_REGISTRY: dict[str, type[BaseConnector]] = {
    "mem0": Mem0Connector,
    "zep": ZepConnector,
    "letta": LettaConnector,
    "langmem": LangMemConnector,
    "generic_rest": GenericRESTConnector,
}


def get_connector(connector_type: str, config: dict) -> BaseConnector:
    """Instantiate a connector by type name."""
    cls = CONNECTOR_REGISTRY.get(connector_type)
    if cls is None:
        raise ValueError(f"Unknown connector type: {connector_type}. Available: {list(CONNECTOR_REGISTRY.keys())}")
    return cls(config)
