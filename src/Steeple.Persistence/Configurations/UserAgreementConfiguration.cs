using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>EF mapping for <see cref="UserAgreement"/>.</summary>
public class UserAgreementConfiguration : IEntityTypeConfiguration<UserAgreement>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<UserAgreement> builder)
    {
        builder.ToTable("user_agreements");

        builder.HasKey(a => a.Id);

        builder.Property(a => a.DocType).HasConversion<int>();
        builder.Property(a => a.Version).IsRequired().HasMaxLength(50);

        // Acceptance is per document version; re-accepting the same version is a no-op.
        builder.HasIndex(a => new { a.UserId, a.DocType, a.Version }).IsUnique();
    }
}
