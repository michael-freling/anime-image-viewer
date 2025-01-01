package db

import (
	"context"

	"gorm.io/gorm"
)

var contextKey = struct{}{}

func withTransaction(ctx context.Context, tx *gorm.DB) context.Context {
	return context.WithValue(ctx, contextKey, tx)
}

func transactionFromContext(ctx context.Context) *gorm.DB {
	tx, _ := ctx.Value(contextKey).(*gorm.DB)
	return tx
}

func NewTransaction(ctx context.Context, client *Client, f func(context.Context) error) error {
	return client.connection.Transaction(func(tx *gorm.DB) error {
		txWithContext := tx.WithContext(ctx)
		return f(withTransaction(ctx, txWithContext))
	})
}
