import asyncio

from .base import BaseSessionInterface
from .utils import ExpiringDict


class InMemorySessionInterface(BaseSessionInterface):
    def __init__(
        self,
        domain: str = None,
        expiry: int = 2592000,
        httponly: bool = True,
        cookie_name: str = "session",
        prefix: str = "session:",
        sessioncookie: bool = False,
        samesite: str = None,
        session_name="session",
        secure: bool = False,
    ):

        super().__init__(
            expiry=expiry,
            prefix=prefix,
            cookie_name=cookie_name,
            domain=domain,
            httponly=httponly,
            sessioncookie=sessioncookie,
            samesite=samesite,
            session_name=session_name,
            secure=secure,
        )
        self.session_store = ExpiringDict()

    async def _get_value(self, prefix, sid):
        await asyncio.sleep(0)
        return self.session_store.get(self.prefix + sid)

    async def _delete_key(self, key):
        await asyncio.sleep(0)
        if key in self.session_store:
            self.session_store.delete(key)

    async def _set_value(self, key, data):
        await asyncio.sleep(0)
        self.session_store.set(key, data, self.expiry)